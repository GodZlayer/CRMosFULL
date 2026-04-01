import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

function nowIso() {
  return new Date().toISOString();
}

function timestampLabel() {
  return nowIso().replace(/[:.]/g, "-");
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(value = "") {
  return normalizeText(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeName(value = "") {
  return normalizeText(value)
    .replace(/^\d+\s*-\s*/u, "")
    .replace(/^-/u, "")
    .replace(/^\s+/u, "")
    .replace(/\s*-\s*$/u, "")
    .toLowerCase();
}

function shouldSkipLegacySheetRow(row) {
  const currentQty = Number(String(row[1] ?? "").replace(",", ".")) || 0;
  const legacyId = normalizeCode(row[2] ?? "");
  const name = normalizeText(row[3] ?? "");
  const price = Number(String(row[4] ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const cost = Number(String(row[5] ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const normalizedName = name.toLowerCase();

  if (!name || name === "-") {
    return true;
  }
  if (normalizedName.endsWith(" -") || normalizedName.endsWith("-")) {
    return true;
  }
  if (normalizedName.startsWith("estoque inicial")) {
    return true;
  }
  if (
    normalizedName.includes("novos produtos") ||
    normalizedName.includes("soma de produtos") ||
    normalizedName.includes("total geral de produtos") ||
    normalizedName.includes("total de usados")
  ) {
    return true;
  }
  if (/^[a-z]{2}9999$/.test(legacyId) || legacyId === "zz9998" || legacyId === "zz9999" || legacyId === "uu9999") {
    return true;
  }
  if (!legacyId && price === 0 && cost === 0 && currentQty === 0) {
    return true;
  }
  return false;
}

function checkpointAndBackupDatabase(dbPath, db) {
  const backupDir = join(dirname(dbPath), "backups");
  const stamp = timestampLabel();
  mkdirSync(backupDir, { recursive: true });

  try {
    db.exec("PRAGMA wal_checkpoint(FULL);");
  } catch {
    // Segue mesmo se o checkpoint falhar.
  }

  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].filter((filePath) => existsSync(filePath));
  for (const filePath of files) {
    const target = join(backupDir, `${stamp}-${filePath.split(/[/\\]/).pop()}`);
    copyFileSync(filePath, target);
  }

  return backupDir;
}

const dbPath = process.argv[2] || "server/storage/database/crm.sqlite";
const db = new DatabaseSync(dbPath);

function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

function run(sql, params = {}) {
  return db.prepare(sql).run(params);
}

function buildLegacySheetCatalogKeys() {
  const rows = all(
    `
      SELECT source_row, raw_payload
      FROM legacy_import_rows
      WHERE source_sheet = 'Estoque'
        AND source_workbook LIKE '%26 CX%'
        AND CAST(source_row AS INTEGER) <= 154
      ORDER BY CAST(source_row AS INTEGER)
    `
  );

  const keys = [];
  for (const row of rows) {
    const payload = JSON.parse(row.raw_payload || "{}");
    const values = Array.isArray(payload.row) ? payload.row : [];
    if (shouldSkipLegacySheetRow(values)) {
      continue;
    }
    keys.push({
      code: normalizeCode(values[2] ?? ""),
      name: normalizeName(values[3] ?? "")
    });
  }

  return keys;
}

function buildActiveCatalog() {
  return all(
    `
      SELECT id, name, sku, legacy_source_id, legacy_source_sheet, item_condition, stock_quantity, cost_amount, price_amount
      FROM catalog_items
      WHERE active = 1
      ORDER BY id
    `
  ).map((item) => ({
    ...item,
    codeCandidates: [normalizeCode(item.sku), normalizeCode(item.legacy_source_id)].filter(Boolean),
    normalizedName: normalizeName(item.name)
  }));
}

function resolveMatchedCatalogIds(sheetKeys, activeCatalog) {
  const catalogByCode = new Map();
  const catalogByName = new Map();

  for (const item of activeCatalog) {
    for (const code of item.codeCandidates) {
      if (!catalogByCode.has(code)) {
        catalogByCode.set(code, []);
      }
      catalogByCode.get(code).push(item);
    }
    if (item.normalizedName) {
      if (!catalogByName.has(item.normalizedName)) {
        catalogByName.set(item.normalizedName, []);
      }
      catalogByName.get(item.normalizedName).push(item);
    }
  }

  const matchedIds = new Set();
  for (const sheetItem of sheetKeys) {
    let matches = sheetItem.code ? catalogByCode.get(sheetItem.code) || [] : [];
    if (!matches.length && sheetItem.name) {
      matches = catalogByName.get(sheetItem.name) || [];
    }
    for (const match of matches) {
      matchedIds.add(match.id);
    }
  }

  return matchedIds;
}

function collectReferenceSummary(id) {
  return {
    order_items: Number(get("SELECT COUNT(*) AS total FROM order_items WHERE catalog_item_id = ?", id)?.total || 0),
    pos_sale_items: Number(get("SELECT COUNT(*) AS total FROM pos_sale_items WHERE catalog_item_id = ?", id)?.total || 0),
    stock_replenishments: Number(get("SELECT COUNT(*) AS total FROM stock_replenishments WHERE catalog_item_id = ?", id)?.total || 0),
    fiscal_document_items: Number(
      get("SELECT COUNT(*) AS total FROM fiscal_document_items WHERE matched_catalog_item_id = ?", id)?.total || 0
    )
  };
}

const backupDir = checkpointAndBackupDatabase(dbPath, db);
const activeCatalog = buildActiveCatalog();
const matchedCatalogIds = resolveMatchedCatalogIds(buildLegacySheetCatalogKeys(), activeCatalog);
const targets = activeCatalog.filter(
  (item) =>
    !matchedCatalogIds.has(item.id) &&
    item.item_condition !== "USADA" &&
    Number(item.stock_quantity || 0) === 0
);

const timestamp = nowIso();
const reportDir = "server/storage/reports";
mkdirSync(reportDir, { recursive: true });

try {
  db.exec("BEGIN IMMEDIATE;");

  const archived = targets.map((item) => {
    const references = collectReferenceSummary(item.id);
    run(
      `
        UPDATE catalog_items
        SET active = 0,
            deleted_at = :deletedAt,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: item.id,
        deletedAt: timestamp,
        updatedAt: timestamp
      }
    );

    return {
      id: item.id,
      sku: item.sku || "",
      name: item.name,
      stock_quantity: Number(item.stock_quantity || 0),
      cost_amount: Number(item.cost_amount || 0),
      price_amount: Number(item.price_amount || 0),
      references
    };
  });

  db.exec("COMMIT;");

  const report = {
    archivedAt: timestamp,
    dbPath,
    backupDir,
    archivedTotal: archived.length,
    archived
  };

  writeFileSync(join(reportDir, "archived-crm-only-new-zero-stock.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  db.exec("ROLLBACK;");
  throw error;
} finally {
  db.close();
}
