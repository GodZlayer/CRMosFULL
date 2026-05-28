import { mkdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pickNamedParams } from "./repository.mjs";
import { createOdsWorkbook } from "./ods-export.mjs";
import { parseOdsBuffer } from "./legacy-ods.mjs";

const SQLITE_EXCLUDED_TABLES = new Set(["sqlite_sequence", "sessions", "company_sessions"]);
const BACKUP_NULL_TOKEN = "__CRM_NULL__";
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

function getSqliteTableColumns(db, tableName) {
  return sqliteAll(db, `PRAGMA table_info(${tableName})`);
}

function normalizeOdsTableName(value = "") {
  return String(value || "").trim();
}

function normalizeBackupCell(value, column = {}) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  if (text === BACKUP_NULL_TOKEN) {
    return null;
  }
  if (text === "") {
    return String(column.type || "").toUpperCase().includes("TEXT") ? "" : null;
  }
  const normalizedType = String(column.type || "").toUpperCase();
  if (normalizedType.includes("INT")) {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  if (normalizedType.includes("REAL") || normalizedType.includes("NUM") || normalizedType.includes("DOUB") || normalizedType.includes("FLOA")) {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return text;
}

function toBackupSheetRows(columns = [], rows = []) {
  const header = columns.map((column) => column.name);
  const body = rows.map((row) => header.map((columnName) => {
    const value = row?.[columnName];
    return value === null || value === undefined ? BACKUP_NULL_TOKEN : value;
  }));
  return [header, ...body];
}

function parseBackupJson(value, fallback = {}) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function buildPosSaleDetailRows(db) {
  const rows = sqliteAll(
    db,
    `
      SELECT
        ps.id,
        ps.code,
        ps.client_name,
        ps.subtotal_amount,
        ps.discount_amount,
        ps.total_amount,
        ps.created_at,
        GROUP_CONCAT(
          CASE
            WHEN psi.quantity > 1 THEN CAST(psi.quantity AS TEXT) || 'x ' || psi.item_name
            ELSE psi.item_name
          END,
          ', '
        ) AS item_summary
      FROM pos_sales ps
      LEFT JOIN pos_sale_items psi ON psi.sale_id = ps.id
      GROUP BY ps.id
      ORDER BY ps.created_at DESC, ps.id DESC
    `
  );

  return [
    ["id", "codigo", "cliente", "itens_vendidos", "subtotal", "desconto", "total", "criado_em"],
    ...rows.map((row) => [
      row.id,
      row.code || "",
      row.client_name || "",
      row.item_summary || "",
      Number(row.subtotal_amount || 0),
      Number(row.discount_amount || 0),
      Number(row.total_amount || 0),
      row.created_at || ""
    ])
  ];
}

function buildReversalHistoryRows(db) {
  const rows = sqliteAll(
    db,
    "SELECT * FROM audit_logs WHERE action IN ('REVERT', 'DELETE') ORDER BY created_at DESC, id DESC"
  )
    .map((row) => ({
      ...row,
      beforeState: parseBackupJson(row.before_state, {}),
      contextData: parseBackupJson(row.context_data, {})
    }))
    .filter((row) => {
      if (String(row.action || "").toUpperCase() === "REVERT") {
        return true;
      }
      if (Boolean(row.contextData?.reversal)) {
        return true;
      }
      return String(row.entity_type || "").toUpperCase() === "POS_SALE";
    });

  return [
    ["id", "data", "usuario", "tipo_entidade", "entidade_id", "acao", "codigo_referencia", "motivo", "valor", "itens_vendidos", "contexto"],
    ...rows.map((row) => {
      const items = Array.isArray(row.beforeState?.items) ? row.beforeState.items : [];
      const itemSummary = items
        .map((item) => `${Number(item.quantity || 0) > 1 ? `${Number(item.quantity || 0)}x ` : ""}${item.item_name || item.itemName || ""}`.trim())
        .filter(Boolean)
        .join(", ");
      return [
        row.id,
        row.created_at || "",
        row.actor_name || "",
        row.entity_type || "",
        row.entity_id || "",
        row.action || "",
        row.beforeState?.code || row.beforeState?.description || row.contextData?.code || row.contextData?.saleCode || "",
        row.contextData?.reason || (String(row.action || "").toUpperCase() === "REVERT" ? "REVERT" : "DELETE"),
        Number(row.beforeState?.total_amount ?? row.beforeState?.amount ?? 0),
        itemSummary,
        row.context_data || ""
      ];
    })
  ];
}

function buildSqliteInsertSql(tableName, columns = [], options = {}) {
  const quotedColumns = columns.map((column) => escapeIdentifier(column));
  const placeholders = columns.map((column) => `:${column}`);
  const baseSql = `INSERT INTO ${escapeIdentifier(tableName)} (${quotedColumns.join(", ")}) VALUES (${placeholders.join(", ")})`;
  const pkColumns = options.pkColumns || [];

  if (!options.upsert || !pkColumns.length || !pkColumns.every((column) => columns.includes(column))) {
    return baseSql;
  }

  const updateColumns = columns.filter((column) => !pkColumns.includes(column));
  if (!updateColumns.length) {
    return `${baseSql} ON CONFLICT (${pkColumns.map((column) => escapeIdentifier(column)).join(", ")}) DO NOTHING`;
  }

  return `${baseSql} ON CONFLICT (${pkColumns.map((column) => escapeIdentifier(column)).join(", ")}) DO UPDATE SET ${updateColumns
    .map((column) => `${escapeIdentifier(column)} = excluded.${escapeIdentifier(column)}`)
    .join(", ")}`;
}

function syncSqliteSequences(db, tables = []) {
  for (const tableName of tables) {
    const pkColumn = getSqliteTableColumns(db, tableName).find((column) => column.pk === 1 && String(column.type || "").toUpperCase().includes("INT"));
    if (!pkColumn) {
      continue;
    }
    const maxId = sqliteAll(db, `SELECT COALESCE(MAX(${escapeIdentifier(pkColumn.name)}), 0) AS maxId FROM ${escapeIdentifier(tableName)}`)[0]?.maxId || 0;
    sqliteRun(db, "UPDATE sqlite_sequence SET seq = :seq WHERE name = :name", { seq: Number(maxId || 0), name: tableName });
    sqliteRun(db, "INSERT INTO sqlite_sequence(name, seq) SELECT :name, :seq WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = :name)", { seq: Number(maxId || 0), name: tableName });
  }
}

export function exportSqliteBackupOds(db, options = {}) {
  const exportedAt = String(options.exportedAt || new Date().toISOString());
  const actorName = String(options.actorName || "Sistema");
  const tables = listPortableSqliteTables(db);
  const sheets = [];
  const summaryRows = [
    { campo: "Exportado em", valor: exportedAt },
    { campo: "Criado por", valor: actorName },
    { campo: "Tabelas exportadas", valor: tables.length }
  ];

  for (const tableName of tables) {
    const rows = sqliteAll(db, `SELECT * FROM ${escapeIdentifier(tableName)}`);
    const columns = getSqliteTableColumns(db, tableName);
    sheets.push({
      name: tableName,
      rows: toBackupSheetRows(columns, rows)
    });
    summaryRows.push({ campo: tableName, valor: rows.length });
  }

  sheets.push({
    name: "PDV detalhado",
    rows: buildPosSaleDetailRows(db)
  });
  sheets.push({
    name: "Historico Reversoes",
    rows: buildReversalHistoryRows(db)
  });

  sheets.unshift({
    name: "Resumo",
    rows: [
      ["campo", "valor"],
      ...summaryRows.map((row) => [row.campo, row.valor])
    ]
  });

  return {
    fileName: String(options.fileName || `backup-crm-${exportedAt.slice(0, 10)}.ods`),
    exportedAt,
    tables: tables.map((tableName) => ({
      table: tableName,
      rows: sqliteAll(db, `SELECT COUNT(*) AS total FROM ${escapeIdentifier(tableName)}`)[0]?.total || 0
    })),
    totalRows: tables.reduce(
      (total, tableName) => total + Number(sqliteAll(db, `SELECT COUNT(*) AS total FROM ${escapeIdentifier(tableName)}`)[0]?.total || 0),
      0
    ),
    buffer: createOdsWorkbook({
      sheets,
      meta: {
        creator: actorName,
        createdAt: exportedAt
      }
    })
  };
}

function readBackupWorkbook(input) {
  if (Buffer.isBuffer(input)) {
    return parseOdsBuffer(input);
  }
  if (input instanceof Uint8Array) {
    return parseOdsBuffer(Buffer.from(input));
  }
  throw new Error("Arquivo ODS invalido para importacao.");
}

export function importSqliteBackupOds(db, input, options = {}) {
  const workbook = readBackupWorkbook(input);
  const tables = listPortableSqliteTables(db);
  const sheetsByName = new Map(workbook.sheets.map((sheet) => [normalizeOdsTableName(sheet.name), sheet]));
  const missingSheets = tables.filter((tableName) => !sheetsByName.has(tableName));
  if (missingSheets.length) {
    throw new Error(`Arquivo ODS incompleto ou legado. Faltam abas: ${missingSheets.join(", ")}`);
  }

  const summary = [];
  const clearExisting = options.clearExisting !== false;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");

  try {
    if (clearExisting) {
      for (const tableName of tables.slice().reverse()) {
        sqliteRun(db, `DELETE FROM ${escapeIdentifier(tableName)}`);
      }
      if (tables.length) {
        const quotedNames = tables.map((name) => `'${String(name).replace(/'/g, "''")}'`).join(", ");
        sqliteRun(db, `DELETE FROM sqlite_sequence WHERE name IN (${quotedNames})`);
      }
    }

    for (const tableName of tables) {
      const sheet = sheetsByName.get(tableName);
      const columns = getSqliteTableColumns(db, tableName);
      const header = Array.isArray(sheet.rows?.[0]) ? sheet.rows[0].map((cell) => String(cell || "").trim()) : [];
      const columnMap = new Map(columns.map((column) => [column.name, column]));
      const usableColumns = header.filter((columnName) => columnMap.has(columnName));
      const insertColumns = usableColumns.length ? usableColumns : columns.map((column) => column.name);
      const headerIndexMap = new Map(header.map((columnName, index) => [columnName, index]));
      if (!insertColumns.length) {
        summary.push({ table: tableName, rows: 0 });
        continue;
      }

      const pkColumns = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk).map((column) => column.name);
      const insertSql = buildSqliteInsertSql(tableName, insertColumns, {
        upsert: !clearExisting,
        pkColumns
      });
      const insert = db.prepare(insertSql);
      let importedRows = 0;

      for (let rowIndex = 1; rowIndex < (sheet.rows?.length || 0); rowIndex += 1) {
        const row = sheet.rows[rowIndex] || [];
        if (!Array.isArray(row)) {
          continue;
        }
        const params = {};
        let emptyRow = true;
        insertColumns.forEach((columnName, columnIndex) => {
          const column = columnMap.get(columnName) || {};
          const headerIndex = headerIndexMap.has(columnName) ? headerIndexMap.get(columnName) : columnIndex;
          const rawValue = headerIndex === undefined ? undefined : row[headerIndex];
          const normalized = normalizeBackupCell(rawValue, column);
          params[columnName] = normalized;
          if (normalized !== null && normalized !== "") {
            emptyRow = false;
          }
        });
        if (emptyRow) {
          continue;
        }
        insert.run(params);
        importedRows += 1;
      }

      summary.push({ table: tableName, rows: importedRows });
    }

    syncSqliteSequences(db, tables);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }

  return {
    importedAt: new Date().toISOString(),
    importedTables: summary,
    totalRows: summary.reduce((total, item) => total + Number(item.rows || 0), 0),
    tables: summary,
    fileName: String(options.fileName || ""),
    exportedAt: workbook?.meta?.creationDate || workbook?.meta?.createdAt || ""
  };
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

function listIndexedSqliteColumns(db, tableName) {
  const columns = sqliteAll(db, `PRAGMA table_info(${tableName})`);
  const foreignKeys = sqliteAll(db, `PRAGMA foreign_key_list(${tableName})`);
  const indexes = sqliteAll(db, `PRAGMA index_list(${tableName})`).filter((row) => row.unique && String(row.origin || "") !== "pk");
  const indexedColumns = new Set(columns.filter((column) => column.pk).map((column) => column.name));

  indexes.forEach((index) => {
    sqliteAll(db, `PRAGMA index_info(${index.name})`).forEach((column) => indexedColumns.add(column.name));
  });
  foreignKeys.forEach((fk) => indexedColumns.add(fk.from));

  return indexedColumns;
}

function buildMysqlAddColumnDefinition(column, context = {}) {
  const pieces = [escapeIdentifier(column.name), mapSqliteTypeToMysql(column.type, column, context)];
  const normalized = String(column.type || "").toUpperCase();
  const isTextLike = normalized.includes("TEXT") || normalized.includes("BLOB");
  const hasDefault = column.dflt_value !== null && column.dflt_value !== undefined;

  if (!column.pk && column.notnull && !isTextLike && hasDefault) {
    pieces.push("NOT NULL");
  }
  if (!column.pk && !isTextLike && hasDefault) {
    pieces.push(`DEFAULT ${String(column.dflt_value)}`);
  }

  return pieces.join(" ");
}

async function listMysqlTableColumns(connection, databaseName, tableName) {
  const [rows] = await connection.query(
    `
      SELECT column_name AS columnName
      FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
      ORDER BY ordinal_position ASC
    `,
    [databaseName, tableName]
  );
  return rows.map((row) => String(row.columnName || ""));
}

async function ensureMysqlTableColumns(connection, db, databaseName, tableName) {
  const localColumns = sqliteAll(db, `PRAGMA table_info(${tableName})`);
  const remoteColumns = new Set(await listMysqlTableColumns(connection, databaseName, tableName));
  const indexedColumns = listIndexedSqliteColumns(db, tableName);
  const missingColumns = localColumns.filter((column) => !column.pk && !remoteColumns.has(column.name));

  for (const column of missingColumns) {
    await connection.query(
      `ALTER TABLE ${escapeIdentifier(tableName)} ADD COLUMN ${buildMysqlAddColumnDefinition(column, {
        isIndexed: indexedColumns.has(column.name)
      })}`
    );
  }

  return localColumns
    .map((column) => column.name)
    .filter((columnName) => {
      if (remoteColumns.has(columnName)) {
        return true;
      }
      return missingColumns.some((column) => column.name === columnName);
    });
}

export function buildMysqlCreateTableSql(db, tableName) {
  const columns = sqliteAll(db, `PRAGMA table_info(${tableName})`);
  const foreignKeys = sqliteAll(db, `PRAGMA foreign_key_list(${tableName})`);
  const indexes = sqliteAll(db, `PRAGMA index_list(${tableName})`).filter((row) => row.unique && String(row.origin || "") !== "pk");
  const indexedColumns = listIndexedSqliteColumns(db, tableName);

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
      const columns =
        payload.replaceExisting === false
          ? await ensureMysqlTableColumns(connection, db, config.database, tableName)
          : sqliteAll(db, `PRAGMA table_info(${tableName})`).map((column) => column.name);

      for (let start = 0; start < rows.length; start += 100) {
        const chunk = rows.slice(start, start + 100);
        if (!chunk.length) {
          continue;
        }
        if (!columns.length) {
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

        const tableColumns = sqliteAll(db, `PRAGMA table_info(${tableName})`);
        const pkColumns = tableColumns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk).map((column) => column.name);
        const sql = buildSqliteInsertSql(tableName, commonColumns, {
          upsert: payload.clearExisting === false,
          pkColumns
        });
        for (const row of rows) {
          const params = Object.fromEntries(commonColumns.map((column) => [column, normalizeSqliteValue(row[column])]));
          sqliteRun(db, sql, params);
        }
        summary.push({ table: tableName, rows: rows.length });
      }

      syncSqliteSequences(db, importTables);
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
