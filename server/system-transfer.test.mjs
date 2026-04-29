import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRepository } from "./app-repository.mjs";
import { parseOdsFile } from "./legacy-ods.mjs";
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

test("exportOperationalOds generates workbook with audit sheets", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "crm-ods-export-"));
  const repo = createAppRepository({
    dbPath: ":memory:",
    storageRoot: tempDir,
    uploadsRoot: tempDir,
    seedDemo: true
  });

  try {
    const exported = repo.exportOperationalOds({
      storeId: 1,
      _actor: { id: 1, name: "QA" }
    });

    assert.equal(exported.fileName.endsWith(".ods"), true);
    assert.ok(exported.buffer.length > 0);

    const filePath = join(tempDir, exported.fileName);
    writeFileSync(filePath, exported.buffer);
    const workbook = parseOdsFile(filePath);
    const sheetNames = workbook.sheets.map((item) => item.name);

    assert.ok(sheetNames.includes("Resumo"));
    assert.ok(sheetNames.includes("Lancamentos"));
    assert.ok(sheetNames.includes("Estoque"));
    assert.ok(sheetNames.includes("Saldos Caixa"));
  } finally {
    repo.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
