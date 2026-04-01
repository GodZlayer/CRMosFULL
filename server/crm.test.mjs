import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEMO_USERS } from "./constants.mjs";
import { createRepository, pickNamedParams } from "./repository.mjs";
import { formatOrderCode, resolveApprovalStatus } from "./domain.mjs";

test("formatOrderCode generates expected daily sequence format", () => {
  assert.equal(formatOrderCode("2026-03-09", 1), "BE-2026-03-09-01");
  assert.equal(formatOrderCode("2026-03-09", 12), "BE-2026-03-09-12");
});

test("resolveApprovalStatus upgrades pre-approved orders within limit", () => {
  assert.equal(
    resolveApprovalStatus({
      approvalStatus: "PRE_APROVADA",
      quoteAmount: 1400,
      preApprovedLimit: 1400,
      actualAmount: 1390
    }),
    "APROVADA"
  );
});

test("resolveApprovalStatus returns awaiting approval when actual exceeds limit", () => {
  assert.equal(
    resolveApprovalStatus({
      approvalStatus: "PRE_APROVADA",
      quoteAmount: 1400,
      preApprovedLimit: 1400,
      actualAmount: 1450
    }),
    "AGUARDANDO_APROVACAO"
  );
});

test("repository saves orders and adjusts stock", () => {
  const repository = createRepository({ dbPath: ":memory:", seedDemo: true });
  const client = repository.listClients({})[0];
  const catalog = repository.listCatalogItems({})[0];
  const before = repository.listCatalogItems({}).find((item) => item.id === catalog.id);

  const order = repository.saveOrder({
    clientId: client.id,
    phoneSnapshot: client.phone,
    equipment: "Notebook Teste",
    defect: "Nao liga",
    extras: "Fonte inclusa",
    technicianName: "Tecnico QA",
    dueDate: "2026-03-09",
    orderStatus: "ABERTA",
    approvalStatus: "PRE_APROVADA",
    quoteAmount: 350,
    preApprovedLimit: 400,
    actualAmount: 390,
    serviceAmount: 100,
    discountAmount: 0,
    paymentMethod: "PIX",
    items: [
      {
        catalogItemId: catalog.id,
        quantity: 1,
        unitCost: catalog.cost_amount,
        unitPrice: catalog.price_amount
      }
    ]
  });

  const after = repository.listCatalogItems({}).find((item) => item.id === catalog.id);

  assert.match(order.code, /^BE-\d{4}-\d{2}-\d{2}-\d{2}$/);
  assert.equal(order.approval_status, "APROVADA");
  assert.equal(Number(before.stock_quantity) - 1, Number(after.stock_quantity));

  repository.close();
});

test("repository returns catalog detail with OS usage history", () => {
  const repository = createRepository({ dbPath: ":memory:", seedDemo: true });
  const order = repository.listOrders({}).find((item) => item.items_count > 0);
  const detailedOrder = repository.getOrder(order.id);
  const catalogItemId = Number(detailedOrder.items[0].catalog_item_id);

  const detail = repository.getCatalogItem(catalogItemId);

  assert.equal(detail?.id, catalogItemId);
  assert.equal(Number(detail?.linked_orders_count) >= 1, true);
  assert.equal(Number(detail?.total_quantity_used) >= 1, true);
  assert.equal((detail?.usage_history?.length ?? 0) >= 1, true);
  assert.equal(detail?.usage_history?.[0].order_code?.length > 0, true);
  repository.close();
});

test("repository deletes unused catalog items and protects items linked to OS", () => {
  const repository = createRepository({ dbPath: ":memory:", seedDemo: true });
  const usedCatalog = repository.listCatalogItems({}).find((item) => Number(item.linked_orders_count) > 0);
  const created = repository.saveCatalogItem({
    sku: "TESTE-DEL-01",
    name: "Item avulso removivel",
    category: "PECAS",
    subcategory: "QA",
    compatibility: "Laboratorio",
    itemCondition: "NOVA",
    stockQuantity: 2,
    minStock: 0,
    costAmount: 10,
    priceAmount: 20,
    isComplete: false,
    active: true
  });

  const result = repository.deleteCatalogItems([usedCatalog.id, created.id]);
  const deletedCreated = repository.getCatalogItem(created.id);
  const keptUsed = repository.getCatalogItem(usedCatalog.id);

  assert.equal(result.deletedCount, 1);
  assert.equal(result.archivedCount, 1);
  assert.equal(result.blockedCount, 0);
  assert.equal(result.deleted[0].id, created.id);
  assert.equal(result.archived[0].id, usedCatalog.id);
  assert.equal(deletedCreated, null);
  assert.equal(keptUsed?.id, usedCatalog.id);
  assert.equal(repository.listCatalogItems({}).some((item) => Number(item.id) === Number(usedCatalog.id)), false);
  repository.close();
});

test("repository creates client without requiring an id", () => {
  const repository = createRepository({ dbPath: ":memory:", seedDemo: false });
  const created = repository.saveClient({
    name: "Cliente Novo",
    phone: "(11) 90000-0000",
    email: "novo@cliente.com",
    document: "123",
    address: "Rua Teste",
    notes: "Criado sem id"
  });

  assert.ok(created.id > 0);
  assert.equal(created.name, "Cliente Novo");
  repository.close();
});

test("repository saves client photo upload and exposes photo url", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "crm-client-photo-"));
  const repository = createRepository({ dbPath: ":memory:", uploadsRoot: tempDir, seedDemo: false });

  const created = repository.saveClient({
    name: "Cliente Foto",
    phone: "(11) 95555-0000",
    photoUpload: {
      base64: `data:image/jpeg;base64,${Buffer.from("fake-client-photo").toString("base64")}`,
      name: "cliente.jpg",
      mimeType: "image/jpeg"
    }
  });

  assert.equal(typeof created.photo_url, "string");
  assert.match(created.photo_url, /^\/uploads\/clients\/\d+\/perfil\.jpg$/);
  assert.equal(existsSync(join(tempDir, "clients", String(created.id), "perfil.jpg")), true);

  repository.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test("pickNamedParams ignores extra keys like id when the SQL does not use them", () => {
  const filtered = pickNamedParams(
    "INSERT INTO clients (name, phone, created_at) VALUES (:name, :phone, :createdAt)",
    {
      id: 99,
      name: "Cliente Novo",
      phone: "(11) 90000-0000",
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "should-be-ignored"
    }
  );

  assert.deepEqual(filtered, {
    name: "Cliente Novo",
    phone: "(11) 90000-0000",
    createdAt: "2026-03-09T00:00:00.000Z"
  });
});

test("repository deletes client with linked service orders and restores stock", () => {
  const repository = createRepository({ dbPath: ":memory:", seedDemo: true });
  const clientWithOrders = repository.listClients({})[0];

  const firstOrder = repository.listOrders({ clientId: clientWithOrders.id })[0];
  const detailedOrder = repository.getOrder(firstOrder.id);
  const itemId = Number(detailedOrder.items[0].catalog_item_id);
  const stockBeforeDelete = repository.listCatalogItems({}).find((item) => item.id === itemId)?.stock_quantity ?? 0;

  const result = repository.deleteClient(clientWithOrders.id);
  const deletedClient = repository.getClient(clientWithOrders.id);
  const deletedOrders = repository.listOrders({ clientId: clientWithOrders.id });
  const stockAfterDelete = repository.listCatalogItems({}).find((item) => item.id === itemId)?.stock_quantity ?? 0;

  assert.equal(result.success, true);
  assert.equal(result.deletedOrders >= 1, true);
  assert.equal(deletedClient, null);
  assert.equal(deletedOrders.length, 0);
  assert.equal(Number(stockAfterDelete), Number(stockBeforeDelete) + 1);
  repository.close();
});

test("repository deletes a service order and restores stock", () => {
  const repository = createRepository({ dbPath: ":memory:", seedDemo: true });
  const order = repository.listOrders({}).find((item) => item.order_status !== "CANCELADA");
  const detailedOrder = repository.getOrder(order.id);
  const itemId = Number(detailedOrder.items[0].catalog_item_id);
  const stockBeforeDelete = repository.listCatalogItems({}).find((item) => item.id === itemId)?.stock_quantity ?? 0;

  repository.saveFinanceEntry({
    entryType: "RECEITA",
    category: "Recebimento de OS",
    description: "Receita vinculada a OS",
    amount: 99,
    entryDate: "2026-03-09",
    paymentMethod: "PIX",
    orderId: order.id
  });

  const result = repository.deleteOrder(order.id);
  const deletedOrder = repository.getOrder(order.id);
  const remainingFinance = repository.listFinanceEntries({}).filter((entry) => entry.order_id === order.id);
  const stockAfterDelete = repository.listCatalogItems({}).find((item) => item.id === itemId)?.stock_quantity ?? 0;

  assert.equal(result.success, true);
  assert.equal(deletedOrder, null);
  assert.equal(remainingFinance.length, 0);
  assert.equal(Number(stockAfterDelete), Number(stockBeforeDelete) + 1);
  repository.close();
});

test("repository clears business data and does not reseed after restart", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "be-crm-clear-"));
  const dbPath = join(tempDir, "crm.sqlite");
  const uploadsRoot = join(tempDir, "uploads");

  const repository = createRepository({ dbPath, uploadsRoot, seedDemo: true });
  const clearResult = repository.clearBusinessData();

  assert.equal(clearResult.success, true);
  assert.equal(clearResult.summary.orders >= 1, true);
  assert.equal(repository.listClients({}).length, 0);
  assert.equal(repository.listCatalogItems({}).length, 0);
  assert.equal(repository.listOrders({}).length, 0);
  assert.equal(repository.listFinanceEntries({}).length, 0);
  repository.close();

  const reopened = createRepository({ dbPath, uploadsRoot, seedDemo: true });
  assert.equal(reopened.listClients({}).length, 0);
  assert.equal(reopened.listCatalogItems({}).length, 0);
  assert.equal(reopened.listOrders({}).length, 0);
  assert.equal(reopened.listFinanceEntries({}).length, 0);
  assert.equal(
    reopened.authenticateUser(DEMO_USERS[0].email, DEMO_USERS[0].password)?.email,
    DEMO_USERS[0].email
  );
  reopened.close();

  rmSync(tempDir, { recursive: true, force: true });
});

