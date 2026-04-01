import { mkdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pickNamedParams } from "./repository.mjs";

const SQLITE_EXCLUDED_TABLES = new Set(["sqlite_sequence", "sessions", "company_sessions"]);
const DEFAULT_MYSQL_CONFIG = {
  host: "168.232.199.161",
  user: "dnle_CRMADMIN",
  password: "daniel",
  database: "dnle_CRM",
  port: 3306
};
let mysqlPromise = null;

function sqliteAll(db, sql, params = {}) {
  return db.prepare(sql).all(pickNamedParams(sql, params));
}

function sqliteRun(db, sql, params = {}) {
  return db.prepare(sql).run(pickNamedParams(sql, params));
}

async function getMysqlClient() {
  if (!mysqlPromise) {
    mysqlPromise = import("mysql2/promise")
      .then((module) => module.default)
      .catch(() => {
        throw new Error("Dependência MySQL não instalada. Rode `npm install` antes de usar Backup e Importação.");
      });
  }
  return mysqlPromise;
}

function escapeIdentifier(name) {
  return `\`${String(name || "").replace(/`/g, "``")}\``;
}

function escapeLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return `'${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/\u0000/g, "")}'`;
}

function normalizeMysqlConfig(payload = {}) {
  const host = String(payload.host || DEFAULT_MYSQL_CONFIG.host || "").trim();
  const user = String(payload.user || DEFAULT_MYSQL_CONFIG.user || "").trim();
  const database = String(payload.database || payload.databaseName || DEFAULT_MYSQL_CONFIG.database || "").trim();
  if (!host || !user || !database) {
    throw new Error("Host, usuário e banco MySQL são obrigatórios.");
  }
  return {
    host,
    user,
    password: String(payload.password || DEFAULT_MYSQL_CONFIG.password || ""),
    database,
    port: Number(payload.port || DEFAULT_MYSQL_CONFIG.port || 3306) || 3306
  };
}

function shouldSkipTable(tableName) {
  return SQLITE_EXCLUDED_TABLES.has(tableName);
}

export function listPortableSqliteTables(db) {
  return sqliteAll(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
  )
    .map((row) => row.name)
    .filter((name) => !shouldSkipTable(name));
}

function mapSqliteTypeToMysql(type = "", column = {}, context = {}) {
  const normalized = String(type || "").toUpperCase();
  if (column.pk && normalized.includes("INT")) {
    return "BIGINT";
  }
  if (normalized.includes("INT")) {
    return "BIGINT";
  }
  if (normalized.includes("REAL") || normalized.includes("NUM") || normalized.includes("FLOA") || normalized.includes("DOUB")) {
    return "DOUBLE";
  }
  if (normalized.includes("BLOB")) {
    return "LONGBLOB";
  }
  if (context.isIndexed) {
    return "VARCHAR(255)";
  }
  return "LONGTEXT";
}

function buildColumnDefinition(column, context = {}) {
  const pieces = [escapeIdentifier(column.name), mapSqliteTypeToMysql(column.type, column, context)];
  if (column.notnull || column.pk) {
    pieces.push("NOT NULL");
  }
  if (column.pk && String(column.type || "").toUpperCase().includes("INT")) {
    pieces.push("AUTO_INCREMENT");
  } else if (!String(column.type || "").toUpperCase().includes("TEXT") && !String(column.type || "").toUpperCase().includes("BLOB") && column.dflt_value !== null && column.dflt_value !== undefined) {
    pieces.push(`DEFAULT ${String(column.dflt_value)}`);
  }
  return pieces.join(" ");
}

export function buildMysqlCreateTableSql(db, tableName) {
  const columns = sqliteAll(db, `PRAGMA table_info(${tableName})`);
  const foreignKeys = sqliteAll(db, `PRAGMA foreign_key_list(${tableName})`);
  const indexes = sqliteAll(db, `PRAGMA index_list(${tableName})`).filter((row) => row.unique && String(row.origin || "") !== "pk");
  const indexedColumns = new Set(columns.filter((column) => column.pk).map((column) => column.name));

  indexes.forEach((index) => {
    sqliteAll(db, `PRAGMA index_info(${index.name})`).forEach((column) => indexedColumns.add(column.name));
  });
  foreignKeys.forEach((fk) => indexedColumns.add(fk.from));

  const definitions = columns.map((column) => buildColumnDefinition(column, {
    isIndexed: indexedColumns.has(column.name)
  }));
  const primaryKeyColumns = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk).map((column) => escapeIdentifier(column.name));
  if (primaryKeyColumns.length) {
    definitions.push(`PRIMARY KEY (${primaryKeyColumns.join(", ")})`);
  }

  indexes.forEach((index) => {
    const info = sqliteAll(db, `PRAGMA index_info(${index.name})`);
    if (!info.length) {
      return;
    }
    definitions.push(`UNIQUE KEY ${escapeIdentifier(index.name)} (${info.map((column) => escapeIdentifier(column.name)).join(", ")})`);
  });

  foreignKeys.forEach((fk, index) => {
    const onDelete = fk.on_delete && fk.on_delete !== "NO ACTION" ? ` ON DELETE ${fk.on_delete}` : "";
    const onUpdate = fk.on_update && fk.on_update !== "NO ACTION" ? ` ON UPDATE ${fk.on_update}` : "";
    definitions.push(
      `CONSTRAINT ${escapeIdentifier(`fk_${tableName}_${index + 1}`)} FOREIGN KEY (${escapeIdentifier(fk.from)}) REFERENCES ${escapeIdentifier(fk.table)} (${escapeIdentifier(fk.to)})${onDelete}${onUpdate}`
    );
  });

  return `CREATE TABLE IF NOT EXISTS ${escapeIdentifier(tableName)} (\n  ${definitions.join(",\n  ")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
}

function buildMysqlInsertSql(tableName, columns, rows) {
  const values = rows
    .map((row) => `(${columns.map((column) => escapeLiteral(row[column])).join(", ")})`)
    .join(",\n");
  return `INSERT INTO ${escapeIdentifier(tableName)} (${columns.map(escapeIdentifier).join(", ")}) VALUES\n${values};`;
}

export function createMysqlDumpFromSqlite(db, options = {}) {
  const databaseName = String(options.databaseName || "crm_backup").trim() || "crm_backup";
  const tables = listPortableSqliteTables(db);
  const lines = [
    `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    `USE ${escapeIdentifier(databaseName)};`,
    "SET NAMES utf8mb4;",
    "SET FOREIGN_KEY_CHECKS=0;",
    ""
  ];
  const summary = [];

  tables.forEach((tableName) => {
    const rows = sqliteAll(db, `SELECT * FROM ${tableName}`);
    const columns = sqliteAll(db, `PRAGMA table_info(${tableName})`).map((column) => column.name);
    lines.push(`DROP TABLE IF EXISTS ${escapeIdentifier(tableName)};`);
    lines.push(buildMysqlCreateTableSql(db, tableName));
    if (rows.length) {
      for (let start = 0; start < rows.length; start += 100) {
        lines.push(buildMysqlInsertSql(tableName, columns, rows.slice(start, start + 100)));
      }
    }
    lines.push("");
    summary.push({ table: tableName, rows: rows.length });
  });

  lines.push("SET FOREIGN_KEY_CHECKS=1;");

  return {
    databaseName,
    fileName: `${databaseName}.mysql.sql`,
    sql: lines.join("\n"),
    tables: summary,
    totalRows: summary.reduce((total, item) => total + item.rows, 0)
  };
}

export async function backupSqliteToMysql(db, payload = {}) {
  const config = normalizeMysqlConfig(payload);
  const mysql = await getMysqlClient();
  const connection = await mysql.createConnection({
    host: config.host,
    user: config.user,
    password: config.password,
    port: config.port,
    multipleStatements: true,
    charset: "utf8mb4"
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(config.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE ${escapeIdentifier(config.database)}`);
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");

    const tables = listPortableSqliteTables(db);
    const summary = [];

    for (const tableName of tables.slice().reverse()) {
      if (payload.replaceExisting !== false) {
        await connection.query(`DROP TABLE IF EXISTS ${escapeIdentifier(tableName)}`);
      }
    }

    for (const tableName of tables) {
      await connection.query(buildMysqlCreateTableSql(db, tableName));
      const rows = sqliteAll(db, `SELECT * FROM ${tableName}`);
      const columns = sqliteAll(db, `PRAGMA table_info(${tableName})`).map((column) => column.name);

      for (let start = 0; start < rows.length; start += 100) {
        const chunk = rows.slice(start, start + 100);
        if (!chunk.length) {
          continue;
        }
        const insertVerb = payload.replaceExisting === false ? "REPLACE" : "INSERT";
        const placeholders = chunk
          .map(() => `(${columns.map(() => "?").join(", ")})`)
          .join(", ");
        const values = chunk.flatMap((row) => columns.map((column) => row[column] ?? null));
        await connection.query(
          `${insertVerb} INTO ${escapeIdentifier(tableName)} (${columns.map(escapeIdentifier).join(", ")}) VALUES ${placeholders}`,
          values
        );
      }

      summary.push({ table: tableName, rows: rows.length });
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 1");

    return {
      databaseName: config.database,
      tables: summary,
      totalRows: summary.reduce((total, item) => total + item.rows, 0),
      exportedAt: new Date().toISOString()
    };
  } finally {
    await connection.end();
  }
}

function normalizeSqliteValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace("T", " ");
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return value;
}

export async function importMysqlToSqlite(db, payload = {}) {
  const config = normalizeMysqlConfig(payload);
  const mysql = await getMysqlClient();
  const connection = await mysql.createConnection({
    host: config.host,
    user: config.user,
    password: config.password,
    port: config.port,
    database: config.database,
    charset: "utf8mb4",
    dateStrings: true
  });

  try {
    const [remoteTablesRows] = await connection.query(
      "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name ASC",
      [config.database]
    );
    const remoteTables = new Set(remoteTablesRows.map((row) => row.tableName).filter((name) => !shouldSkipTable(name)));
    const localTables = listPortableSqliteTables(db);
    const importTables = localTables.filter((tableName) => remoteTables.has(tableName));
    const missingTables = localTables.filter((tableName) => !remoteTables.has(tableName));
    const summary = [];

    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN IMMEDIATE;");
    try {
      if (payload.clearExisting !== false) {
        for (const tableName of importTables.slice().reverse()) {
          sqliteRun(db, `DELETE FROM ${tableName}`);
        }
      }

      for (const tableName of importTables) {
        const [rows] = await connection.query(`SELECT * FROM ${escapeIdentifier(tableName)}`);
        const localColumns = sqliteAll(db, `PRAGMA table_info(${tableName})`).map((column) => column.name);
        const commonColumns = localColumns.filter((column) => rows.length === 0 || Object.prototype.hasOwnProperty.call(rows[0], column));

        if (!commonColumns.length) {
          summary.push({ table: tableName, rows: 0 });
          continue;
        }

        const sql = `
          INSERT INTO ${tableName} (${commonColumns.join(", ")})
          VALUES (${commonColumns.map((column) => `:${column}`).join(", ")})
        `;
        for (const row of rows) {
          const params = Object.fromEntries(commonColumns.map((column) => [column, normalizeSqliteValue(row[column])]));
          sqliteRun(db, sql, params);
        }
        summary.push({ table: tableName, rows: rows.length });
      }

      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON;");
    }

    return {
      databaseName: config.database,
      importedTables: summary,
      missingTables,
      totalRows: summary.reduce((total, item) => total + item.rows, 0),
      importedAt: new Date().toISOString()
    };
  } finally {
    await connection.end();
  }
}

function deriveWorkbookName(source = {}, index) {
  const hint = String(source.name || source.kind || source.label || "").toLowerCase();
  if (hint.includes("servi")) {
    return "Serviços 2026.ods";
  }
  if (hint.includes("caixa") || hint.includes("26 cx") || hint.includes("fluxo")) {
    return "26 CX Loja ok em 29 02.ods";
  }
  return `Importação ${index + 1}.ods`;
}

export function normalizeGoogleDocsOdsUrl(rawUrl) {
  const parsed = new URL(String(rawUrl || "").trim());
  if (/docs\.google\.com$/i.test(parsed.hostname) && parsed.pathname.includes("/spreadsheets/d/")) {
    const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (match) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=ods`;
    }
  }
  return parsed.toString();
}

export async function downloadLegacyWorkbookSources(sources = [], options = {}) {
  const baseTempRoot = options.tempRoot || tmpdir();
  mkdirSync(baseTempRoot, { recursive: true });
  const tempRoot = await mkdtemp(join(baseTempRoot, "crm-legacy-ods-"));
  const downloaded = [];
  try {
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index] || {};
      const url = normalizeGoogleDocsOdsUrl(source.url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Falha ao baixar ${url} (${response.status}).`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const fileName = deriveWorkbookName(source, index);
      const targetPath = join(tempRoot, fileName);
      await writeFile(targetPath, buffer);
      downloaded.push({
        fileName,
        originalUrl: String(source.url || ""),
        resolvedUrl: url,
        path: targetPath,
        size: buffer.length
      });
    }
    return downloaded;
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function cleanupDownloadedSources(downloaded = []) {
  const roots = [...new Set(downloaded.map((item) => item?.path ? dirname(item.path) : "").filter(Boolean))];
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}
