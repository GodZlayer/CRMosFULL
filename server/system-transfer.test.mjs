import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRepository } from "./app-repository.mjs";
import { parseOdsBuffer, parseOdsFile } from "./legacy-ods.mjs";
import { buildMysqlCreateTableSql, createMysqlDumpFromSqlite, normalizeGoogleDocsOdsUrl } from "./system-transfer.mjs";

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
      "Importacao Legada"
    ]);
  } finally {
    repo.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
