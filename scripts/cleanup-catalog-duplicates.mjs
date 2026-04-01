import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

function nowIso() {
  return new Date().toISOString();
}

function timestampLabel() {
  return nowIso().replace(/[:.]/g, "-");
}

function get(sql, params = {}) {
  return db.prepare(sql).get(params);
}

function all(sql, params = {}) {
  return db.prepare(sql).all(params);
}

function run(sql, params = {}) {
  return db.prepare(sql).run(params);
}

function checkpointAndBackupDatabase(dbPath) {
  const backupDir = join(dirname(dbPath), "backups");
  const stamp = timestampLabel();
  mkdirSync(backupDir, { recursive: true });

  try {
    db.exec("PRAGMA wal_checkpoint(FULL);");
  } catch {
    // Segue mesmo se o checkpoint nao puder ser forcado.
  }

  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].filter((filePath) => existsSync(filePath));
  files.forEach((filePath) => {
    const target = join(backupDir, `${stamp}-${filePath.split(/[/\\]/).pop()}`);
    copyFileSync(filePath, target);
  });

  return backupDir;
}

function appendMergeNote(description, note) {
  const current = String(description || "").trim();
  if (!current) {
    return note;
  }
  if (current.includes(note)) {
    return current;
  }
  return `${current} | ${note}`;
}

function mergeGroup({ canonicalId, donorIds, standardizedName = "", archiveOnly = false }) {
  const timestamp = nowIso();
  const ids = [canonicalId, ...donorIds].filter(Boolean);
  const items = all(
    `SELECT id, sku, name, description, stock_quantity, min_stock, cost_amount, price_amount, active, deleted_at
     FROM catalog_items
     WHERE id IN (${ids.join(",")})
     ORDER BY id`
  );

  if (!items.length) {
    return {
      canonicalId,
      donorIds,
      skipped: true,
      reason: "ITEMS_NOT_FOUND"
    };
  }

  const canonical = archiveOnly ? null : items.find((item) => Number(item.id) === Number(canonicalId));
  const donors = items.filter((item) => donorIds.includes(Number(item.id)));

  if (!archiveOnly && !canonical) {
    throw new Error(`Item canonico ${canonicalId} nao encontrado.`);
  }

  const touchedReferenceTables = [];
  for (const donor of donors) {
    if (!archiveOnly && canonical) {
      for (const [table, column] of [
        ["order_items", "catalog_item_id"],
        ["pos_sale_items", "catalog_item_id"],
        ["stock_replenishments", "catalog_item_id"],
        ["fiscal_document_items", "matched_catalog_item_id"]
      ]) {
        const total = Number(get(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column} = :id`, { id: donor.id })?.total || 0);
        if (total > 0) {
          run(`UPDATE ${table} SET ${column} = :canonicalId WHERE ${column} = :donorId`, {
            canonicalId: canonical.id,
            donorId: donor.id
          });
          touchedReferenceTables.push({ table, donorId: donor.id, total });
        }
      }
    }
  }

  if (!archiveOnly && canonical) {
    const mergedSkuList = donors.map((item) => String(item.sku || "").trim()).filter(Boolean);
    const mergedStock = [canonical, ...donors].reduce((sum, item) => sum + Number(item.stock_quantity || 0), 0);
    const mergedMinStock = [canonical, ...donors].reduce((sum, item) => sum + Number(item.min_stock || 0), 0);
    const mergeNote = mergedSkuList.length ? `SKUs mesclados: ${mergedSkuList.join(", ")}` : "";

    run(
      `
        UPDATE catalog_items
        SET name = :name,
            description = :description,
            stock_quantity = :stockQuantity,
            min_stock = :minStock,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: canonical.id,
        name: standardizedName || canonical.name,
        description: appendMergeNote(canonical.description, mergeNote),
        stockQuantity: mergedStock,
        minStock: mergedMinStock,
        updatedAt: timestamp
      }
    );
  }

  donors.forEach((donor) => {
    run(
      `
        UPDATE catalog_items
        SET active = 0,
            stock_quantity = 0,
            min_stock = 0,
            sku = NULL,
            deleted_at = :deletedAt,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: donor.id,
        deletedAt: timestamp,
        updatedAt: timestamp
      }
    );
  });

  return {
    canonicalId,
    donorIds,
    archiveOnly,
    touchedReferenceTables
  };
}

const dbPath = process.argv[2] || "server/storage/database/crm.sqlite";
const db = new DatabaseSync(dbPath);

const backupDir = checkpointAndBackupDatabase(dbPath);

try {
  db.exec("BEGIN IMMEDIATE;");

  const summary = {
    backupDir,
    operations: []
  };

  summary.operations.push(
    mergeGroup({
      canonicalId: 8,
      donorIds: [19],
      standardizedName: "Gabinete aqu\u00e1rio branco"
    })
  );

  summary.operations.push(
    mergeGroup({
      canonicalId: 28,
      donorIds: [13, 49],
      standardizedName: "RAM 2g DDR3"
    })
  );

  summary.operations.push(
    mergeGroup({
      canonicalId: 0,
      donorIds: [45, 60],
      archiveOnly: true
    })
  );

  db.exec("COMMIT;");
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  db.exec("ROLLBACK;");
  throw error;
} finally {
  db.close();
}
