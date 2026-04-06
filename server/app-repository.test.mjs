import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DEMO_USERS } from "./constants.mjs";
import { createAppRepository } from "./app-repository.mjs";

function getActor(repository) {
  return repository.authenticateUser(DEMO_USERS[0].email, DEMO_USERS[0].password);
}

test("app repository creates low stock notifications and ignores used items", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: false });

  repository.saveCatalogItem({
    sku: "LOW-SEMI-01",
    name: "SSD Seminovo em baixa",
    category: "SSD",
    itemCondition: "SEMINOVA",
    stockQuantity: 1,
    minStock: 3,
    costAmount: 100,
    priceAmount: 180,
    active: true
  });

  repository.saveCatalogItem({
    sku: "USED-01",
    name: "Peca usada fora da regra",
    category: "Fonte",
    itemCondition: "USADA",
    stockQuantity: 0,
    minStock: 2,
    costAmount: 20,
    priceAmount: 45,
    active: true
  });

  const notifications = repository.listNotifications({});

  assert.equal(notifications.some((item) => item.rule_key === "LOW_STOCK:1"), true);
  assert.equal(notifications.some((item) => String(item.title).includes("usada")), false);
  repository.close();
});

test("app repository cria tarefa automatica ao abrir OS sem duplicar em edicoes", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const client = repository.listClients({})[0];

  const created = repository.saveOrder({
    clientId: client.id,
    phoneSnapshot: client.phone,
    equipment: "Notebook tarefa automatica",
    defect: "Nao inicia",
    technicianName: "Tecnico Agenda",
    dueDate: "2026-03-12",
    orderStatus: "ABERTA",
    approvalStatus: "PRE_APROVADA",
    quoteAmount: 200,
    preApprovedLimit: 250,
    actualAmount: 0,
    serviceAmount: 80,
    paymentMethod: "PIX",
    items: [],
    _actor: actor
  });

  const tasksAfterCreate = repository.listTasks({ storeId: repository.getCurrentStore().id }).filter((item) => Number(item.order_id) === Number(created.id));

  repository.saveOrder({
    id: created.id,
    clientId: client.id,
    phoneSnapshot: client.phone,
    equipment: "Notebook tarefa automatica",
    defect: "Nao inicia e nao carrega",
    technicianName: "Tecnico Agenda",
    dueDate: "2026-03-12",
    orderStatus: "EM_ANDAMENTO",
    approvalStatus: "PRE_APROVADA",
    quoteAmount: 200,
    preApprovedLimit: 250,
    actualAmount: 0,
    serviceAmount: 80,
    paymentMethod: "PIX",
    items: [],
    _actor: actor
  });

  const tasksAfterUpdate = repository.listTasks({ storeId: repository.getCurrentStore().id }).filter((item) => Number(item.order_id) === Number(created.id));

  assert.equal(tasksAfterCreate.length, 1);
  assert.equal(tasksAfterCreate[0].title.includes(created.code), true);
  assert.equal(tasksAfterCreate[0].client_name, client.name);
  assert.equal(tasksAfterCreate[0].device, "Notebook tarefa automatica");
  assert.equal(tasksAfterUpdate.length, 1);
  repository.close();
});

test("app repository records audit logs and timeline events for service orders", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const client = repository.listClients({})[0];
  const catalog = repository.listCatalogItems({}).find((item) => Number(item.stock_quantity) > 1);

  const created = repository.saveOrder({
    clientId: client.id,
    phoneSnapshot: client.phone,
    equipment: "Notebook timeline",
    defect: "Nao liga",
    technicianName: "Tecnico Fluxo",
    dueDate: "2026-03-10",
    orderStatus: "ABERTA",
    approvalStatus: "PRE_APROVADA",
    quoteAmount: 350,
    preApprovedLimit: 400,
    actualAmount: 390,
    serviceAmount: 120,
    paymentMethod: "PIX",
    items: [{ catalogItemId: catalog.id, quantity: 1, unitCost: catalog.cost_amount, unitPrice: catalog.price_amount }],
    _actor: actor
  });

  repository.saveOrder({
    id: created.id,
    clientId: client.id,
    phoneSnapshot: client.phone,
    equipment: "Notebook timeline",
    defect: "Nao liga",
    technicianName: "Tecnico Fluxo",
    dueDate: "2026-03-10",
    orderStatus: "CONCLUIDA",
    approvalStatus: "APROVADA",
    quoteAmount: 350,
    preApprovedLimit: 400,
    actualAmount: 390,
    serviceAmount: 120,
    paymentMethod: "PIX",
    items: [{ catalogItemId: catalog.id, quantity: 1, unitCost: catalog.cost_amount, unitPrice: catalog.price_amount }],
    _actor: actor
  });

  const logs = repository.listAuditLogs({ entityType: "ORDER" });
  const timeline = repository.getOrderTimeline(created.id);

  assert.equal(logs.some((item) => item.action === "CREATE"), true);
  assert.equal(logs.some((item) => item.action === "STATUS_CHANGE"), true);
  assert.equal((timeline?.events.length ?? 0) >= 2, true);
  repository.close();
});

test("app repository imports fiscal xml and applies create/restock action", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: false });
  const xml = `
    <NFe>
      <infNFe Id="NFe35160300000000000100550010000000011000000010">
        <ide><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-03-10T10:00:00-03:00</dhEmi></ide>
        <emit><xNome>Fornecedor Teste</xNome><CNPJ>12345678000199</CNPJ></emit>
        <total><ICMSTot><vNF>199.90</vNF></ICMSTot></total>
        <det nItem="1"><prod><cProd>SSD-480</cProd><cEAN>7890000000001</cEAN><xProd>SSD 480GB</xProd><NCM>84717012</NCM><uCom>UN</uCom><qCom>2.00</qCom><vUnCom>99.95</vUnCom><vProd>199.90</vProd></prod></det>
      </infNFe>
    </NFe>
  `;

  const document = repository.saveFiscalDocument({ xmlText: xml });
  const applyResult = repository.applyFiscalDocumentActions(document.id, {
    actions: [
      {
        fiscalItemId: document.items[0].id,
        action: "CREATE_ITEM",
        category: "SSD",
        itemCondition: "NOVA",
        quantity: 2,
        unitCost: 99.95,
        priceAmount: 149.9
      }
    ]
  });

  const catalog = repository.listCatalogItems({});
  assert.equal(document.document_type, "NF-e");
  assert.equal(applyResult.success, true);
  assert.equal(catalog.length, 1);
  assert.equal(Number(catalog[0].stock_quantity), 2);
  repository.close();
});

test("app repository opens cash session and creates PDV sale with stock decrement", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const store = repository.getCurrentStore();
  const item = repository.listCatalogItems({}).find((entry) => Number(entry.stock_quantity) > 1);
  const client = repository.listClients({})[0];
  const beforeStock = Number(item.stock_quantity);
  const openingSnapshot = repository
    .listStoreCashAccounts(store.id)
    .filter((entry) => ["CC_PIX_PJ_MAQ_VERM", "MAQ_AMARELA_PIX_CEL", "CAIXINHA_LOJA", "R_COM_DENIO", "OUTROS_REGINA", "ARTHUR", "BOLETOS"].includes(String(entry.code)))
    .reduce((sum, entry) => sum + Number(entry.balance_amount || 0), 0);

  const cashSession = repository.openCashSession({ _actor: actor });
  const sale = repository.createPosSale({
    cashSessionId: cashSession.id,
    clientId: client.id,
    paymentMethod: "PIX",
    items: [{ catalogItemId: item.id, quantity: 1, unitPrice: item.price_amount }],
    _actor: actor
  });

  const afterStock = Number(repository.listCatalogItems({}).find((entry) => entry.id === item.id)?.stock_quantity || 0);
  const finance = repository.listFinanceEntries({}).filter((entry) => entry.category === "Venda de produto");

  assert.equal(cashSession.status, "OPEN");
  assert.equal(Number(cashSession.opening_amount), Number(openingSnapshot));
  assert.equal(beforeStock - 1, afterStock);
  assert.equal(sale.payments[0].payment_method, "PIX");
  assert.equal(finance.length >= 1, true);
  repository.close();
});

test("app repository fecha caixa com valores automaticos do saldo registrado", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const store = repository.getCurrentStore();
  const item = repository.listCatalogItems({}).find((entry) => Number(entry.stock_quantity) > 1);
  const client = repository.listClients({})[0];

  const session = repository.openCashSession({ _actor: actor });
  repository.createPosSale({
    cashSessionId: session.id,
    clientId: client.id,
    paymentMethod: "CAIXINHA_LOJA",
    items: [{ catalogItemId: item.id, quantity: 1, unitPrice: item.price_amount }],
    _actor: actor
  });

  const expectedClosing = repository
    .listStoreCashAccounts(store.id)
    .filter((entry) => ["CC_PIX_PJ_MAQ_VERM", "MAQ_AMARELA_PIX_CEL", "CAIXINHA_LOJA", "R_COM_DENIO", "OUTROS_REGINA", "ARTHUR", "BOLETOS"].includes(String(entry.code)))
    .reduce((sum, entry) => sum + Number(entry.balance_amount || 0), 0);

  const closed = repository.closeCashSession(session.id, { _actor: actor });

  assert.equal(closed.status, "CLOSED");
  assert.equal(Number(closed.expected_amount), Number(expectedClosing));
  assert.equal(Number(closed.closing_amount), Number(expectedClosing));
  repository.close();
});

test("app repository registra venda do PDV sem cliente cadastrado e resume isso no dashboard", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const item = repository.listCatalogItems({}).find((entry) => Number(entry.stock_quantity) > 1);

  const session = repository.openCashSession({ _actor: actor });
  const sale = repository.createPosSale({
    cashSessionId: session.id,
    clientId: null,
    clientName: "Cliente sem cadastro",
    paymentMethod: "CAIXINHA_LOJA",
    items: [{ catalogItemId: item.id, quantity: 1, unitPrice: item.price_amount }],
    _actor: actor
  });

  const dashboard = repository.getDashboardSummary({});

  assert.equal(Number(sale.client_id || 0), 0);
  assert.equal(sale.client_name, "Cliente sem cadastro");
  assert.equal(Number(dashboard.kpis.anonymousPdvSales || 0) >= 1, true);
  assert.equal(Number(dashboard.kpis.anonymousPdvRevenue || 0) >= Number(sale.total_amount || 0), true);
  repository.close();
});

test("app repository registra receita ao concluir OS na conta escolhida", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const client = repository.listClients({})[0];
  const item = repository.listCatalogItems({}).find((entry) => Number(entry.stock_quantity) > 1);

  const created = repository.saveOrder({
    clientId: client.id,
    phoneSnapshot: client.phone,
    equipment: "Notebook financeiro",
    defect: "Nao carrega",
    orderStatus: "ABERTA",
    approvalStatus: "APROVADA",
    actualAmount: 220,
    serviceAmount: 90,
    paymentMethod: "ARTHUR",
    items: [{ catalogItemId: item.id, quantity: 1, unitCost: item.cost_amount, unitPrice: item.price_amount }],
    _actor: actor
  });

  repository.saveOrder({
    id: created.id,
    clientId: client.id,
    phoneSnapshot: client.phone,
    equipment: "Notebook financeiro",
    defect: "Nao carrega",
    orderStatus: "CONCLUIDA",
    approvalStatus: "APROVADA",
    actualAmount: 220,
    serviceAmount: 90,
    paymentMethod: "ARTHUR",
    items: [{ catalogItemId: item.id, quantity: 1, unitCost: item.cost_amount, unitPrice: item.price_amount }],
    _actor: actor
  });

  const financeEntry = repository.listFinanceEntries({}).find((entry) => Number(entry.order_id) === Number(created.id) && entry.category === "Recebimento de OS");
  const arthurAccount = repository.listStoreCashAccounts(repository.getCurrentStore().id).find((entry) => entry.code === "ARTHUR");

  assert.ok(financeEntry);
  assert.equal(financeEntry.payment_method, "ARTHUR");
  assert.equal(Number(financeEntry.amount), Number(created.total_amount));
  assert.equal(Number(arthurAccount.balance_amount) >= Number(created.total_amount), true);
  repository.close();
});

test("app repository arquiva item ja vendido no PDV sem estourar foreign key", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const item = repository.listCatalogItems({}).find((entry) => Number(entry.stock_quantity) > 1);
  const client = repository.listClients({})[0];

  const cashSession = repository.openCashSession({ _actor: actor });
  repository.createPosSale({
    cashSessionId: cashSession.id,
    clientId: client.id,
    paymentMethod: "PIX",
    items: [{ catalogItemId: item.id, quantity: 1, unitPrice: item.price_amount }],
    _actor: actor
  });

  const result = repository.deleteCatalogItems([item.id], { _actor: actor });

  assert.equal(result.deletedCount, 0);
  assert.equal(result.archivedCount, 1);
  assert.equal(result.blockedCount, 0);
  assert.equal(result.archived[0].id, item.id);
  assert.equal(Number(result.archived[0].linkedPosSales || 0) >= 1, true);
  assert.equal(repository.listCatalogItems({}).some((entry) => Number(entry.id) === Number(item.id)), false);
  repository.close();
});

test("app repository remove venda do PDV e devolve estoque e caixa", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const item = repository.listCatalogItems({}).find((entry) => Number(entry.stock_quantity) > 1);
  const client = repository.listClients({})[0];
  const beforeStock = Number(item.stock_quantity || 0);

  const cashSession = repository.openCashSession({ _actor: actor });
  const sale = repository.createPosSale({
    cashSessionId: cashSession.id,
    clientId: client.id,
    paymentMethod: "ARTHUR",
    items: [{ catalogItemId: item.id, quantity: 1, unitPrice: item.price_amount }],
    _actor: actor
  });

  const accountBeforeDelete = repository
    .listStoreCashAccounts(repository.getCurrentStore().id)
    .find((entry) => entry.code === "ARTHUR");
  assert.equal(Number(accountBeforeDelete?.balance_amount || 0) >= Number(sale.total_amount || 0), true);

  const result = repository.deletePosSale(sale.id, { _actor: actor });

  const afterStock = Number(repository.listCatalogItems({}).find((entry) => entry.id === item.id)?.stock_quantity || 0);
  const remainingSales = repository.listPosSales({});
  const remainingFinance = repository.listFinanceEntries({}).filter((entry) => entry.category === "Venda de produto");
  const accountAfterDelete = repository
    .listStoreCashAccounts(repository.getCurrentStore().id)
    .find((entry) => entry.code === "ARTHUR");

  assert.equal(result.success, true);
  assert.equal(afterStock, beforeStock);
  assert.equal(remainingSales.length, 0);
  assert.equal(remainingFinance.length, 0);
  assert.equal(Number(accountAfterDelete?.balance_amount || 0), 0);
  repository.close();
});

test("company login opens profile selection context before choosing active user", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const auth = repository.authenticateCompany("contato@brasilexpress.info", "empresa123");
  const token = repository.createCompanySession(auth.company.code);
  const beforeSelection = repository.getSessionContext(token);
  const afterSelection = repository.selectProfile(token, auth.profiles[0].id);

  assert.equal(auth.company.name, "Brasil Express");
  assert.equal(auth.profiles.length, 5);
  assert.deepEqual(auth.profiles.map((item) => item.name), ["Denio", "Geovanne", "Sofia", "Arthur", "Daniel S."]);
  assert.equal(beforeSelection.user, null);
  assert.equal(afterSelection.user?.id, auth.profiles[0].id);
  repository.close();
});






test("dashboard e relatorios contabilizam OS e PDV como entradas operacionais", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const client = repository.listClients({})[0];
  const item = repository.listCatalogItems({}).find((entry) => Number(entry.stock_quantity) > 2);
  const baselineDashboard = repository.getDashboardSummary({});
  const baselineReports = repository.getReports({});

  const order = repository.saveOrder({
    clientId: client.id,
    phoneSnapshot: client.phone,
    equipment: "Notebook gerencial",
    defect: "Sem video",
    dueDate: "2026-03-10",
    orderStatus: "ABERTA",
    approvalStatus: "APROVADA",
    actualAmount: 300,
    serviceAmount: 120,
    paymentMethod: "PIX",
    items: [{ catalogItemId: item.id, quantity: 1, unitCost: item.cost_amount, unitPrice: item.price_amount }],
    _actor: actor
  });

  const session = repository.openCashSession({ _actor: actor });
  const sale = repository.createPosSale({
    cashSessionId: session.id,
    clientId: client.id,
    paymentMethod: "DINHEIRO",
    items: [{ catalogItemId: item.id, quantity: 1 }],
    _actor: actor
  });

  const dashboard = repository.getDashboardSummary({});
  const reports = repository.getReports({});

  assert.equal(Number(dashboard.kpis.orderRevenue) - Number(baselineDashboard.kpis.orderRevenue || 0), Number(order.total_amount));
  assert.equal(Number(dashboard.kpis.pdvRevenue) - Number(baselineDashboard.kpis.pdvRevenue || 0), Number(sale.total_amount));
  assert.equal(Number(dashboard.kpis.totalEntries) - Number(baselineDashboard.kpis.totalEntries || 0), Number(order.total_amount) + Number(sale.total_amount));
  assert.equal(Number(reports.summary.totalPdvValue) - Number(baselineReports.summary.totalPdvValue || 0), Number(sale.total_amount));
  assert.equal(Number(reports.summary.totalEntries) - Number(baselineReports.summary.totalEntries || 0), Number(order.total_amount) + Number(sale.total_amount));
  assert.equal((reports.pdvSales?.length ?? 0) >= (baselineReports.pdvSales?.length ?? 0) + 1, true);
  repository.close();
});


test("relatorios usam o mesmo fluxo de caixa do financeiro para listar transacoes", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const client = repository.listClients({})[0];
  const item = repository.listCatalogItems({}).find((entry) => Number(entry.stock_quantity) > 1);

  const session = repository.openCashSession({ _actor: actor });
  const sale = repository.createPosSale({
    cashSessionId: session.id,
    clientId: client.id,
    paymentMethod: "PIX",
    items: [{ catalogItemId: item.id, quantity: 1, unitPrice: item.price_amount }],
    _actor: actor
  });

  const reports = repository.getReports({});
  const workbook = repository.getFinanceWorkbookView({});
  const reportEntry = (reports.finance || []).find((entry) => entry.description === `Pagamento da venda ${sale.code}`);
  const ledgerEntry = (workbook.ledger || []).find((entry) => entry.description === `Pagamento da venda ${sale.code}`);

  assert.ok(reportEntry);
  assert.ok(ledgerEntry);
  assert.equal(reportEntry.description, ledgerEntry.description);
  assert.equal(Number(reportEntry.amount), Number(ledgerEntry.amount));
  repository.close();
});

test("relatorios mantem valor e unidades do estoque pelo estoque real atual", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const fullInventory = repository
    .listCatalogItems({ activeOnly: true })
    .filter((item) => !String(item.deleted_at || "").trim());
  const expectedValue = fullInventory.reduce((sum, item) => sum + Number(item.stock_value || 0), 0);
  const expectedUnits = fullInventory.reduce((sum, item) => sum + Number(item.stock_quantity || 0), 0);
  const filteredReports = repository.getReports({ search: "__nao_existe_no_catalogo__" });

  assert.equal(Number(filteredReports.summary.totalInventoryValue || 0), expectedValue);
  assert.equal(Number(filteredReports.summary.totalInventoryUnits || 0), expectedUnits);
  assert.equal(Number(filteredReports.summary.totalInventoryItems || 0), fullInventory.length);
  assert.equal(filteredReports.inventory.length, 0);
  repository.close();
});

test("sistema desfaz a ultima reposicao e remove estoque, financeiro e caixa vinculados", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const store = repository.getCurrentStore();
  const targetAccount = repository.listStoreCashAccounts(store.id).find((entry) => Number(entry.active || 0) === 1 && entry.code === "MAQ_AMARELA_PIX_CEL");

  const created = repository.saveCatalogItem({
    name: "Teste desfazer reposicao",
    category: "Acessórios",
    itemCondition: "NOVA",
    stockQuantity: 0,
    minStock: 0,
    costAmount: 10,
    priceAmount: 20,
    _actor: actor
  });

  const replenished = repository.replenishCatalogItem(created.id, {
    quantity: 3,
    costAmount: 10,
    priceAmount: 20,
    cashAccountId: targetAccount.id,
    _actor: actor
  });

  const replenishmentId = replenished.replenishment_history?.[0]?.id;
  const reverted = repository.revertCatalogReplenishment(replenishmentId, { actor });
  const financeEntry = repository.listFinanceEntries({ storeId: store.id }).find((entry) => String(entry.description).includes("Teste desfazer reposicao"));
  const ledgerEntry = repository.getFinanceWorkbookView({ storeId: store.id }).ledger.find((entry) => String(entry.description).includes("Teste desfazer reposicao"));
  const refreshedAccount = repository.listStoreCashAccounts(store.id).find((entry) => Number(entry.id) === Number(targetAccount.id));

  assert.equal(Number(reverted.stock_quantity || 0), 0);
  assert.equal((reverted.replenishment_history || []).length, 0);
  assert.equal(financeEntry, undefined);
  assert.equal(ledgerEntry, undefined);
  assert.equal(Number(refreshedAccount.balance_amount), 0);
  repository.close();
});

test("financeiro reverte reposicao pelo lancamento e limpa estoque, financeiro e caixa", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const store = repository.getCurrentStore();
  const targetAccount = repository.listStoreCashAccounts(store.id).find((entry) => Number(entry.active || 0) === 1 && entry.code === "MAQ_AMARELA_PIX_CEL");

  const created = repository.saveCatalogItem({
    name: "Teste reversao financeiro reposicao",
    category: "Acessórios",
    itemCondition: "NOVA",
    stockQuantity: 0,
    minStock: 0,
    costAmount: 10,
    priceAmount: 20,
    _actor: actor
  });

  repository.replenishCatalogItem(created.id, {
    quantity: 2,
    costAmount: 10,
    priceAmount: 20,
    cashAccountId: targetAccount.id,
    _actor: actor
  });

  const financeEntry = repository.listFinanceEntries({ storeId: store.id }).find((entry) => String(entry.description).includes("Teste reversao financeiro reposicao"));
  assert.ok(financeEntry);

  repository.revertFinancialTransaction({ financeEntryId: financeEntry.id }, { actor });

  const refreshedItem = repository.getCatalogItem(created.id);
  const refreshedFinanceEntry = repository.listFinanceEntries({ storeId: store.id }).find((entry) => String(entry.description).includes("Teste reversao financeiro reposicao"));
  const refreshedLedgerEntry = repository.getFinanceWorkbookView({ storeId: store.id }).ledger.find((entry) => String(entry.description).includes("Teste reversao financeiro reposicao"));
  const refreshedAccount = repository.listStoreCashAccounts(store.id).find((entry) => Number(entry.id) === Number(targetAccount.id));

  assert.equal(Number(refreshedItem.stock_quantity || 0), 0);
  assert.equal((refreshedItem.replenishment_history || []).length, 0);
  assert.equal(refreshedFinanceEntry, undefined);
  assert.equal(refreshedLedgerEntry, undefined);
  assert.equal(Number(refreshedAccount.balance_amount), 0);
  repository.close();
});

test("financeiro reverte venda do PDV pelo lancamento e remove estoque, caixa e financeiro vinculados", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const store = repository.getCurrentStore();
  const product = repository.saveCatalogItem({
    name: "Produto reversao PDV",
    category: "Acessórios",
    itemCondition: "NOVA",
    stockQuantity: 3,
    minStock: 0,
    costAmount: 10,
    priceAmount: 25,
    _actor: actor
  });

  const session = repository.openCashSession({
    openingAmount: 0,
    paymentMethod: "CAIXINHA_LOJA",
    notes: "Teste reversao PDV",
    _actor: actor
  });

  const sale = repository.createPosSale({
    cashSessionId: session.id,
    items: [{ itemType: "PRODUCT", catalogItemId: product.id, quantity: 2 }],
    paymentMethod: "CAIXINHA_LOJA",
    _actor: actor
  });

  const financeEntry = repository.listFinanceEntries({ storeId: store.id }).find((entry) => String(entry.description) === `Venda ${sale.code}`);
  assert.ok(financeEntry);

  repository.revertFinancialTransaction({ financeEntryId: financeEntry.id }, { actor });

  const refreshedItem = repository.getCatalogItem(product.id);
  const refreshedSale = repository.getPosSale(sale.id);
  const refreshedFinanceEntry = repository.listFinanceEntries({ storeId: store.id }).find((entry) => String(entry.description) === `Venda ${sale.code}`);
  const refreshedCashMovement = repository
    .listStoreCashMovements({ storeId: store.id })
    .find((entry) => Number(entry.sale_id || 0) === Number(sale.id));

  assert.equal(Number(refreshedItem.stock_quantity || 0), 3);
  assert.equal(refreshedSale, null);
  assert.equal(refreshedFinanceEntry, undefined);
  assert.equal(refreshedCashMovement, undefined);
  repository.close();
});

test("reposicao respeita a conta selecionada no saldo e no financeiro", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const store = repository.getCurrentStore();
  const targetAccount = repository.listStoreCashAccounts(store.id).find((entry) => Number(entry.active || 0) === 1 && entry.code === "MAQ_AMARELA_PIX_CEL");

  const created = repository.saveCatalogItem({
    name: "Teste conta reposicao",
    category: "Acessórios",
    itemCondition: "NOVA",
    stockQuantity: 0,
    minStock: 0,
    costAmount: 10,
    priceAmount: 20,
    _actor: actor
  });

  repository.replenishCatalogItem(created.id, {
    quantity: 2,
    costAmount: 10,
    priceAmount: 20,
    cashAccountId: targetAccount.id,
    _actor: actor
  });

  const financeEntry = repository.listFinanceEntries({ storeId: store.id }).find((entry) => String(entry.description).includes("Teste conta reposicao"));
  const ledgerEntry = repository.getFinanceWorkbookView({ storeId: store.id }).ledger.find((entry) => String(entry.description).includes("Teste conta reposicao"));
  const refreshedAccount = repository.listStoreCashAccounts(store.id).find((entry) => Number(entry.id) === Number(targetAccount.id));

  assert.equal(financeEntry.cash_account_id, targetAccount.id);
  assert.equal(financeEntry.payment_method, targetAccount.code);
  assert.equal(ledgerEntry.cash_account_id, targetAccount.id);
  assert.equal(Number(refreshedAccount.balance_amount), -20);
  repository.close();
});

test("estoque inicial e reposicao geram despesa no financeiro e aparecem em relatorios", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const store = repository.getCurrentStore();
  const cashAccount = repository.listStoreCashAccounts(store.id).find((entry) => Number(entry.active || 0) === 1);

  const created = repository.saveCatalogItem({
    name: "Mouse gamer teste",
    category: "Acessórios",
    itemCondition: "NOVA",
    stockQuantity: 3,
    minStock: 1,
    costAmount: 50,
    priceAmount: 90,
    cashAccountId: cashAccount.id,
    _actor: actor
  });

  repository.replenishCatalogItem(created.id, {
    quantity: 2,
    costAmount: 60,
    priceAmount: 95,
    cashAccountId: cashAccount.id,
    _actor: actor
  });

  const financeEntries = repository
    .listFinanceEntries({ storeId: store.id })
    .filter((entry) => entry.category === "Compra de produto" && String(entry.description).includes("Mouse gamer teste"));
  const reports = repository.getReports({ storeId: store.id });
  const purchaseEntries = (reports.purchases || []).filter((entry) => String(entry.description).includes("Mouse gamer teste"));
  const ledgerEntries = repository
    .getFinanceWorkbookView({ storeId: store.id })
    .ledger
    .filter((entry) => String(entry.description).includes("Mouse gamer teste"));

  assert.equal(financeEntries.length, 2);
  assert.deepEqual(financeEntries.map((entry) => entry.legacy_section), ["COMPRAS", "COMPRAS"]);
  assert.equal(financeEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), 270);
  assert.equal(purchaseEntries.length, 2);
  assert.equal(ledgerEntries.length, 2);
  repository.close();
});

test("app repository registra andamento manual na timeline da OS", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const order = repository.listOrders({}).find((item) => item.order_status === "EM_ANDAMENTO") || repository.listOrders({})[0];
  const before = repository.getOrderTimeline(order.id);

  const updated = repository.saveOrderTimelineEvent(order.id, {
    title: "Limpeza e formatacao",
    description: "Notebook limpo internamente, SSD revisado e Windows reinstalado.",
    eventType: "SERVICO_EXECUTADO",
    eventDate: "2026-03-11",
    color: "#198754",
    _actor: actor
  });

  assert.equal((updated?.events.length ?? 0), (before?.events.length ?? 0) + 1);
  assert.equal(updated?.events.at(-1)?.title, "Limpeza e formatacao");
  assert.equal(updated?.events.at(-1)?.actor_name, actor.name);
  repository.close();
});
test("app repository move OS aberta para em andamento ao registrar a primeira acao", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const order = repository.listOrders({}).find((item) => item.order_status === "ABERTA");

  const updated = repository.saveOrderTimelineEvent(order.id, {
    title: "Diagnostico inicial",
    description: "Primeira verificacao tecnica registrada na OS.",
    eventType: "DIAGNOSTICO",
    eventDate: "2026-03-11",
    color: "#fd7e14",
    _actor: actor
  });

  assert.equal(updated?.order.order_status, "EM_ANDAMENTO");
  assert.equal(updated?.events.some((item) => item.event_type === "STATUS_CHANGE"), true);
  repository.close();
});
test("app repository conclui a OS ao registrar entrega ou retorno", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const order = repository.listOrders({}).find((item) => item.order_status === "ABERTA");

  const updated = repository.saveOrderTimelineEvent(order.id, {
    title: "Equipamento entregue ao cliente",
    description: "Cliente retirou o notebook e confirmou funcionamento.",
    eventType: "ENTREGA_RETORNO",
    eventDate: "2026-03-12",
    color: "#6f42c1",
    _actor: actor
  });

  assert.equal(updated?.order.order_status, "CONCLUIDA");
  assert.equal(updated?.order.delivered_at, "2026-03-12");
  assert.equal(updated?.order.concluded_at, "2026-03-12");
  assert.equal(updated?.events.some((item) => item.event_type === "STATUS_CHANGE"), true);
  repository.close();
});

test("app repository compartilha o caixa por loja entre perfis da mesma empresa", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actorOne = repository.authenticateUser(DEMO_USERS[0].email, DEMO_USERS[0].password);
  const actorTwo = repository.authenticateUser(DEMO_USERS[1].email, DEMO_USERS[1].password);
  const store = repository.getCurrentStore("BRASIL_EXPRESS");

  const opened = repository.openCashSession({
    storeId: store.id,
    _actor: actorOne
  });
  const reused = repository.openCashSession({
    storeId: store.id,
    _actor: actorTwo
  });
  const openSessions = repository.listCashSessions({ storeId: store.id, openOnly: true });

  assert.equal(opened.store_id, store.id);
  assert.equal(opened.id, reused.id);
  assert.equal(openSessions.length, 1);
  assert.equal(openSessions[0].opened_by_user_id, actorOne.id);
  repository.close();
});

test("app repository gerencia tarefas diarias em quadro kanban com historico", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: true });
  const actor = getActor(repository);
  const store = repository.getCurrentStore("BRASIL_EXPRESS");
  const order = repository.listOrders({})[0];

  const created = repository.saveTask({
      storeId: store.id,
      orderId: order.id,
      title: "Retornar cliente com diagnostico",
      description: "Confirmar custo final e previsao.",
      taskDate: "2026-03-16",
      status: "PENDENTE",
      priority: "BAIXA",
      legacyQueueCode: "0 HJ",
      responsibleName: actor.name,
      clientName: order.client_name,
      phone: order.client_phone,
      device: order.equipment,
      contactChannel: "WHATSAPP",
    checklist: [
      { label: "Enviar resumo", checked: false },
      { label: "Registrar resposta", checked: false }
    ],
    initialUpdate: "Tarefa criada a partir da fila operacional.",
    _actor: actor
  });

  const boardBefore = repository.getTaskBoard({ taskDate: "2026-03-16", storeId: store.id });
  const pendingColumn = boardBefore.columns.find((column) => column.code === "PENDENTE");
  const updated = repository.saveTaskUpdate(created.id, {
    message: "Cliente respondeu e autorizou prosseguir.",
    status: "EM_ANDAMENTO",
    _actor: actor
  });
  const boardAfter = repository.getTaskBoard({ taskDate: "2026-03-16", storeId: store.id });
  const progressColumn = boardAfter.columns.find((column) => column.code === "EM_ANDAMENTO");

    assert.ok(created.id > 0);
    assert.equal(created.store_id, store.id);
    assert.equal(created.order_id, order.id);
    assert.equal(created.priority, "URGENTE");
    assert.equal(created.legacy_queue_label, "Hoje");
    assert.equal(created.legacy_status_label, "Hoje");
    assert.equal(created.updates.length, 1);
    assert.equal(created.checklist.length, 2);
  assert.equal(pendingColumn?.tasks.some((task) => task.id === created.id), true);
  assert.equal(updated.status, "EM_ANDAMENTO");
  assert.equal(updated.updates.length, 2);
  assert.equal(updated.updates.at(-1)?.actor_name, actor.name);
  assert.equal(progressColumn?.tasks.some((task) => task.id === created.id), true);
  repository.close();
});

test("app repository sincroniza tarefas pela aba Atual da tarefas.ods e preserva o valor textual", () => {
  const repository = createAppRepository({ dbPath: ":memory:", seedDemo: false });
  const actor = getActor(repository);
  const store = repository.getCurrentStore("BRASIL_EXPRESS");

  const manualTask = repository.saveTask({
    storeId: store.id,
    title: "Tarefa manual antiga",
    clientName: "Antiga",
    description: "Deve ser removida pela sincronizacao.",
    legacyQueueCode: "0 HJ",
    _actor: actor
  });

  const result = repository.importLegacyOds({
    storeId: store.id,
    files: [
      join(process.cwd(), "tarefas.ods")
    ],
    _actor: actor
  });

  const tasks = repository.listTasks({ storeId: store.id });
  const readyTask = tasks.find((item) => item.legacy_queue_code === "5 Pron");
  const notifiedTask = tasks.find((item) => item.legacy_queue_code === "6 Agu");
  const deliveredTask = tasks.find((item) => item.legacy_queue_code === "7 Ent");
  const textValueTask = tasks.find((item) => item.client_name === "Aliança Francesa Renata");
  const denioTask = tasks.find((item) => item.legacy_queue_code === "8 Denio");

  assert.equal(manualTask.id > 0, true);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0]?.workbook, "tarefas.ods");
  assert.equal(result.files[0]?.tasksCreated, 28);
  assert.equal(tasks.length, 28);
  assert.equal(tasks.some((item) => item.title === "Tarefa manual antiga"), false);
  assert.equal(tasks.every((item) => item.source_workbook === "tarefas.ods" && item.source_sheet === "Atual"), true);
  assert.equal(readyTask?.status, "EM_ANDAMENTO");
  assert.equal(notifiedTask?.status, "AGUARDANDO");
  assert.equal(deliveredTask?.status, "CONCLUIDA");
  assert.equal(textValueTask?.value_label, "Avaliar");
  assert.equal(textValueTask?.value_amount, null);
  assert.equal(denioTask?.responsible_name, "Dênio");
  repository.close();
});



