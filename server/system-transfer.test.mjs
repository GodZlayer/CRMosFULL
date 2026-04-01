import test from "node:test";
import assert from "node:assert/strict";
import { createAppRepository } from "./app-repository.mjs";
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
