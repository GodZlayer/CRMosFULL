import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRepository } from "./app-repository.mjs";
import { parseOdsBuffer, parseOdsFile } from "./legacy-ods.mjs";
import {
  buildMysqlCreateTableSql,
  createMysqlDumpFromSqlite,
  exportSqliteBackupOds,
  importSqliteBackupOds,
  normalizeGoogleDocsOdsUrl
} from "./system-transfer.mjs";

test("normalizeGoogleDocsOdsUrl converts spreadsheet links to ods export", () => {
  const url = normalizeGoogleDocsOdsUrl("https://docs.google.com/spreadsheets/d/abc123/edit?gid=0#gid=0");
  assert.equal(url, "https://docs.google.com/spreadsheets/d/abc123/export?format=ods");
});

test("createMysqlDumpFromSqlite generates mysql-compatible dump summary", () => {
  const repo = createAppRepository({
    dbPath: ":memory:",
    storageRoot: ":memory:",
    uploadsRoot: ".",
    seedDemo: false
  });

  try {
    const dump = createMysqlDumpFromSqlite(repo.db, { databaseName: "crm_teste" });
    assert.equal(dump.databaseName, "crm_teste");
    assert.match(dump.sql, /CREATE DATABASE IF NOT EXISTS `crm_teste`/);
    assert.ok(dump.tables.some((item) => item.table === "clients"));
    assert.ok(dump.tables.some((item) => item.table === "daily_tasks"));
  } finally {
    repo.close();
  }
});

test("buildMysqlCreateTableSql uses varchar(255) for indexed text columns", () => {
  const repo = createAppRepository({
    dbPath: ":memory:",
    storageRoot: ":memory:",
    uploadsRoot: ".",
    seedDemo: false
  });

  try {
    const sql = buildMysqlCreateTableSql(repo.db, "app_settings");
    assert.match(sql, /`key` VARCHAR\(255\) NOT NULL/);
    assert.doesNotMatch(sql, /`key` LONGTEXT/);
  } finally {
    repo.close();
  }
});

test("importSqliteBackupOds updates existing finance entries when merging backup", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "crm-backup-merge-"));
  const repo = createAppRepository({
    dbPath: ":memory:",
    storageRoot: tempDir,
    uploadsRoot: tempDir,
    seedDemo: false
  });

  try {
    const entry = repo.saveFinanceEntry({
      entryType: "RECEITA",
      category: "Outras receitas",
      description: "Lancamento antes do backup",
      amount: 123,
      entryDate: "2026-05-19",
      paymentMethod: "PIX",
      registerStoreCashMovement: false,
      _actor: { id: 1, name: "QA" }
    });
    const exported = exportSqliteBackupOds(repo.db, { actorName: "QA" });

    repo.saveFinanceEntry({
      id: entry.id,
      entryType: "RECEITA",
      category: "Outras receitas",
      description: "Lancamento alterado localmente",
      amount: 999,
      entryDate: "2026-05-19",
      paymentMethod: "PIX",
      registerStoreCashMovement: false,
      _actor: { id: 1, name: "QA" }
    });

    const result = importSqliteBackupOds(repo.db, exported.buffer, { clearExisting: false });
    const restored = repo.listFinanceEntries({}).find((item) => Number(item.id) === Number(entry.id));

    assert.ok(result.totalRows > 0);
    assert.equal(restored.description, "Lancamento antes do backup");
    assert.equal(Number(restored.amount), 123);
  } finally {
    repo.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("exportSqliteBackupOds includes pdv details and reversal history sheets", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "crm-backup-detail-"));
  const repo = createAppRepository({
    dbPath: ":memory:",
    storageRoot: tempDir,
    uploadsRoot: tempDir,
    seedDemo: true
  });

  try {
    const actor = { id: 1, name: "QA" };
    const store = repo.getCurrentStore();
    const product = repo.saveCatalogItem({
      name: "Produto backup PDV",
      category: "Acessórios",
      itemCondition: "NOVA",
      stockQuantity: 2,
      minStock: 0,
      costAmount: 10,
      priceAmount: 35,
      _actor: actor
    });
    const session = repo.openCashSession({
      openingAmount: 0,
      paymentMethod: "CAIXINHA_LOJA",
      _actor: actor
    });
    const sale = repo.createPosSale({
      cashSessionId: session.id,
      items: [{ itemType: "PRODUCT", catalogItemId: product.id, quantity: 1 }],
      paymentMethod: "CAIXINHA_LOJA",
      _actor: actor
    });
    const financeEntry = repo.listFinanceEntries({ storeId: store.id }).find((entry) => String(entry.description) === `Venda ${sale.code}`);
    repo.revertFinancialTransaction({ financeEntryId: financeEntry.id }, { actor });

    const workbook = parseOdsBuffer(exportSqliteBackupOds(repo.db, { actorName: "QA" }).buffer);
    const pdvDetail = workbook.sheets.find((sheet) => sheet.name === "PDV detalhado");
    const reversals = workbook.sheets.find((sheet) => sheet.name === "Historico Reversoes");

    assert.ok(pdvDetail);
    assert.ok(reversals);
    assert.ok(reversals.rows.some((row) => row.includes(sale.code)));
  } finally {
    repo.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("exportOperationalOds generates the legacy operational workbook", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "crm-ods-export-"));
  const repo = createAppRepository({
    dbPath: ":memory:",
    storageRoot: tempDir,
    uploadsRoot: tempDir,
    seedDemo: true
  });

  try {
    const exported = repo.exportOperationalOds({
      _actor: { id: 1, name: "QA" }
    });

    assert.equal(exported.fileName.endsWith(".ods"), true);
    assert.ok(exported.buffer.length > 0);

    const filePath = join(tempDir, exported.fileName);
    writeFileSync(filePath, exported.buffer);
    const workbook = parseOdsFile(filePath);
    const sheetNames = workbook.sheets.map((item) => item.name);
    assert.deepEqual(sheetNames, [
      "Resumo",
      "Saldos Caixa",
      "Movimentos Caixa",
      "Lancamentos",
      "Estoque",
      "Reposicoes",
      "Ordens Servico",
      "Itens OS",
      "Clientes",
      "Vendas PDV",
      "Itens PDV",
      "Pagamentos PDV",
      "Historico Reversoes",
      "Importacao Legada"
    ]);

    assert.ok(workbook.sheets.find((item) => item.name === "Estoque")?.rows?.length > 1);
    assert.ok(workbook.sheets.find((item) => item.name === "Clientes")?.rows?.length > 1);
  } finally {
    repo.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("importOperationalOds accepts the legacy workbook and restores operational tables", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "crm-ods-import-"));
  const repo = createAppRepository({
    dbPath: ":memory:",
    storageRoot: tempDir,
    uploadsRoot: tempDir,
    seedDemo: true
  });

  try {
    const samplePath = join(process.cwd(), "exportacao-loja-principal-2026-04-30.ods");
    const sample = readFileSync(samplePath);
    const result = repo.importOperationalOds({
      fileName: "exportacao-loja-principal-2026-04-30.ods",
      contentBase64: sample.toString("base64"),
      _actor: { id: 1, name: "QA" }
    });

    assert.equal(result.workbook, "exportacao-loja-principal-2026-04-30.ods");
    assert.ok(repo.listCatalogItems({}).length > 0);
    assert.ok(repo.listClients({}).length > 0);
    assert.ok(repo.listOrders({}).length > 0);
    assert.ok(repo.listPosSales({}).length > 0);
    const currentStore = repo.getCurrentStore();
    const importedAccounts = repo.listStoreCashAccounts(currentStore.id);
    assert.equal(Number(importedAccounts.find((account) => account.code === "CAIXINHA_LOJA")?.balance_amount || 0), 150);
    assert.equal(Number(importedAccounts.find((account) => account.code === "CC_PIX_PJ_MAQ_VERM")?.balance_amount || 0), 3509.22);

    const exported = repo.exportOperationalOds({ _actor: { id: 1, name: "QA" } });
    const workbook = parseOdsBuffer(exported.buffer);
    assert.deepEqual(workbook.sheets.map((item) => item.name), [
      "Resumo",
      "Saldos Caixa",
      "Movimentos Caixa",
      "Lancamentos",
      "Estoque",
      "Reposicoes",
      "Ordens Servico",
      "Itens OS",
      "Clientes",
      "Vendas PDV",
      "Itens PDV",
      "Pagamentos PDV",
      "Historico Reversoes",
      "Importacao Legada"
    ]);
  } finally {
    repo.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("operational ODS preserves catalog created and replenishment timestamps", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "crm-ods-dates-"));
  const source = createAppRepository({
    dbPath: ":memory:",
    storageRoot: tempDir,
    uploadsRoot: tempDir,
    seedDemo: true
  });
  const target = createAppRepository({
    dbPath: ":memory:",
    storageRoot: tempDir,
    uploadsRoot: tempDir,
    seedDemo: true
  });

  try {
    const actor = { id: 1, name: "QA" };
    const store = source.getCurrentStore();
    const account = source.listStoreCashAccounts(store.id).find((entry) => Number(entry.active || 0) === 1);
    const item = source.saveCatalogItem({
      name: "Item com data preservada",
      category: "Acessórios",
      itemCondition: "NOVA",
      stockQuantity: 0,
      minStock: 0,
      costAmount: 12,
      priceAmount: 30,
      _actor: actor
    });
    const replenished = source.replenishCatalogItem(item.id, {
      quantity: 2,
      costAmount: 12,
      priceAmount: 30,
      cashAccountId: account.id,
      _actor: actor
    });
    const replenishmentId = replenished.replenishment_history?.[0]?.id;
    source.db.prepare("UPDATE catalog_items SET created_at = :createdAt, updated_at = :updatedAt WHERE id = :id").run({
      id: item.id,
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-03T04:05:06.000Z"
    });
    source.db.prepare("UPDATE stock_replenishments SET created_at = :createdAt WHERE id = :id").run({
      id: replenishmentId,
      createdAt: "2026-01-04T05:06:07.000Z"
    });

    const exported = source.exportOperationalOds({ _actor: actor });
    target.importOperationalOds({
      fileName: exported.fileName,
      contentBase64: exported.buffer.toString("base64"),
      _actor: actor
    });

    const imported = target.listCatalogItems({ search: "Item com data preservada" })[0];
    assert.equal(imported.created_at, "2026-01-02T03:04:05.000Z");
    assert.equal(imported.last_replenishment_at, "2026-01-04T05:06:07.000Z");
  } finally {
    source.close();
    target.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
