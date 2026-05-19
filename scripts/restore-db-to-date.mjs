#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const repoRoot = process.cwd();
const defaultDbPath = path.join(repoRoot, "server/storage/database/crm.sqlite");
const dbPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultDbPath;
const cutoffInput = process.argv[3] || "2026-04-28T00:00:00-03:00";
const restoreScope = String(process.argv[4] || "all").toLowerCase();
const cutoffTime = Date.parse(cutoffInput);

if (Number.isNaN(cutoffTime)) {
  throw new Error(`Cutoff invalido: ${cutoffInput}`);
}

if (!fs.existsSync(dbPath)) {
  throw new Error(`Banco nao encontrado: ${dbPath}`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join("/tmp", `crm-before-restore-${timestamp}.sqlite`);
fs.copyFileSync(dbPath, backupPath);
for (const suffix of ["-wal", "-shm"]) {
  const sidecar = `${dbPath}${suffix}`;
  if (fs.existsSync(sidecar)) {
    fs.copyFileSync(sidecar, `${backupPath}${suffix}`);
  }
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

const logs = db
  .prepare(
    `
      SELECT *
      FROM audit_logs
      WHERE created_at >= :cutoff
      ORDER BY created_at DESC, id DESC
    `
  )
  .all({ cutoff: cutoffInput });

const summary = {
  backupPath,
  cutoff: cutoffInput,
  scope: restoreScope,
  processedLogs: logs.length,
  deletedRows: 0,
  restoredRows: 0,
  updatedRows: 0,
  syntheticBatches: 0,
  deletedFinanceMovements: 0,
  deletedPosMovements: 0
};

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizedTable(table) {
  return table.replace(/[^a-zA-Z0-9_]/g, "");
}

function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${normalizedTable(table)})`).all().map((row) => row.name);
}

const columnCache = new Map();
function getColumns(table) {
  if (!columnCache.has(table)) {
    columnCache.set(table, tableColumns(table));
  }
  return columnCache.get(table);
}

function rowExists(table, id) {
  return Boolean(db.prepare(`SELECT 1 FROM ${normalizedTable(table)} WHERE id = ? LIMIT 1`).get(id));
}

function deleteById(table, id) {
  db.prepare(`DELETE FROM ${normalizedTable(table)} WHERE id = ?`).run(id);
}

function buildRowPayload(table, row) {
  const payload = {};
  for (const column of getColumns(table)) {
    if (Object.prototype.hasOwnProperty.call(row, column)) {
      payload[column] = row[column];
    }
  }
  if (table === "catalog_items" && payload.sku === "") {
    payload.sku = null;
  }
  return payload;
}

function upsertRow(table, row) {
  const payload = buildRowPayload(table, row);
  if (!Object.prototype.hasOwnProperty.call(payload, "id")) {
    throw new Error(`Registro sem id para ${table}`);
  }
  const existing = rowExists(table, payload.id);
  if (existing) {
    const assignments = Object.keys(payload)
      .filter((key) => key !== "id")
      .map((key) => `"${key}" = @${key}`)
      .join(", ");
    if (assignments) {
      db.prepare(`UPDATE ${normalizedTable(table)} SET ${assignments} WHERE id = @id`).run(payload);
    }
  } else {
    const columns = Object.keys(payload).map((key) => `"${key}"`).join(", ");
    const placeholders = Object.keys(payload).map((key) => `@${key}`).join(", ");
    db.prepare(`INSERT INTO ${normalizedTable(table)} (${columns}) VALUES (${placeholders})`).run(payload);
  }
}

function insertSyntheticBatch(item) {
  const createdAt = item.created_at || new Date().toISOString();
  const restoredBatch = {
    catalog_item_id: Number(item.id),
    source_type: "MANUAL_ADJUSTMENT",
    source_id: Number(item.id),
    quantity: Number(item.stock_quantity || 0),
    quantity_remaining: Number(item.stock_quantity || 0),
    unit_cost: Number(item.cost_amount || 0),
    unit_price: Number(item.price_amount || 0),
    notes: "Restauração manual do estado de 2026-04-27",
    created_at: createdAt,
    updated_at: createdAt
  };
  const columns = Object.keys(restoredBatch).map((key) => `"${key}"`).join(", ");
  const placeholders = Object.keys(restoredBatch).map((key) => `@${key}`).join(", ");
  db.prepare(`INSERT INTO catalog_stock_batches (${columns}) VALUES (${placeholders})`).run(restoredBatch);
  summary.syntheticBatches += 1;
}

function recalcAllCashAccounts() {
  const accounts = db.prepare("SELECT id, baseline_amount FROM store_cash_accounts ORDER BY id").all();
  const stmt = db.prepare(
    `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN entry_type = 'RECEITA' OR movement_type = 'TRANSFER_IN' THEN amount
            ELSE 0
          END
        ), 0) AS total_revenue,
        COALESCE(SUM(
          CASE
            WHEN entry_type = 'DESPESA' OR movement_type = 'TRANSFER_OUT' THEN amount
            ELSE 0
          END
        ), 0) AS total_expense
      FROM store_cash_movements
      WHERE cash_account_id = :accountId
    `
  );
  const update = db.prepare(
    `
      UPDATE store_cash_accounts
      SET balance_amount = :balanceAmount,
          updated_at = :updatedAt
      WHERE id = :id
    `
  );
  for (const account of accounts) {
    const totals = stmt.get({ accountId: Number(account.id) }) || { total_revenue: 0, total_expense: 0 };
    update.run({
      id: Number(account.id),
      balanceAmount: Number(account.baseline_amount || 0) + Number(totals.total_revenue || 0) - Number(totals.total_expense || 0),
      updatedAt: new Date().toISOString()
    });
  }
}

function refreshAllCatalogStockQuantities() {
  const items = db.prepare("SELECT id FROM catalog_items ORDER BY id").all();
  const update = db.prepare(
    `
      UPDATE catalog_items
      SET stock_quantity = (
        SELECT COALESCE(SUM(quantity_remaining), 0)
        FROM catalog_stock_batches
        WHERE catalog_item_id = :id
      )
      WHERE id = :id
    `
  );
  for (const item of items) {
    update.run({ id: Number(item.id) });
  }
}

db.exec("BEGIN IMMEDIATE");

try {
  for (const log of logs) {
    const entityType = String(log.entity_type || "");
    const action = String(log.action || "");
    const entityId = Number(log.entity_id || 0) || null;
    const beforeState = parseJson(log.before_state, null);

    if (restoreScope === "stock" && !["CATALOG_ITEM", "CATALOG_STOCK_BATCH"].includes(entityType)) {
      continue;
    }

    if (entityType === "SYSTEM_TRANS" || entityType === "SESSION_PROF") {
      continue;
    }

    if (entityType === "FINANCE" && action === "CREATE" && entityId) {
      const affectedAccounts = db
        .prepare("SELECT DISTINCT cash_account_id FROM store_cash_movements WHERE finance_entry_id = ?")
        .all(entityId)
        .map((row) => Number(row.cash_account_id || 0))
        .filter(Boolean);
      db.prepare("DELETE FROM store_cash_movements WHERE finance_entry_id = ?").run(entityId);
      summary.deletedFinanceMovements += affectedAccounts.length;
      deleteById("finance_entries", entityId);
      summary.deletedRows += 1;
      continue;
    }

    if (entityType === "POS_SALE" && action === "CREATE" && entityId) {
      const affectedAccounts = db
        .prepare("SELECT DISTINCT cash_account_id FROM store_cash_movements WHERE sale_id = ?")
        .all(entityId)
        .map((row) => Number(row.cash_account_id || 0))
        .filter(Boolean);
      db.prepare("DELETE FROM store_cash_movements WHERE sale_id = ?").run(entityId);
      summary.deletedPosMovements += affectedAccounts.length;
      deleteById("pos_sales", entityId);
      summary.deletedRows += 1;
      continue;
    }

    if (entityType === "CASH_SESSION" && action === "OPEN" && entityId) {
      deleteById("cash_sessions", entityId);
      summary.deletedRows += 1;
      continue;
    }

    if (entityType === "CATALOG_ITEM") {
      if (action === "CREATE" && entityId) {
        deleteById("catalog_items", entityId);
        summary.deletedRows += 1;
        continue;
      }

      if (action === "UPDATE" && beforeState && beforeState.id) {
        upsertRow("catalog_items", beforeState);
        summary.updatedRows += 1;
        continue;
      }

      if (action === "DELETE_BATCH" && Array.isArray(beforeState)) {
        for (const item of beforeState) {
          const createdAt = Date.parse(item.created_at || "");
          if (Number.isNaN(createdAt) || createdAt >= cutoffTime) {
            continue;
          }
          upsertRow("catalog_items", item);
          if (Number(item.stock_quantity || 0) > 0) {
            const batchCount = Number(
              db
                .prepare("SELECT COUNT(*) AS total FROM catalog_stock_batches WHERE catalog_item_id = ?")
                .get(Number(item.id))?.total || 0
            );
            if (batchCount === 0) {
              insertSyntheticBatch(item);
            }
          }
          summary.restoredRows += 1;
        }
        continue;
      }
    }

    if (entityType === "CATALOG_STOCK_BATCH" && action === "UPDATE_LOT" && beforeState && beforeState.id) {
      const batchCreatedAt = Date.parse(beforeState.created_at || "");
      if (!Number.isNaN(batchCreatedAt) && batchCreatedAt >= cutoffTime) {
        deleteById("catalog_stock_batches", Number(beforeState.id));
        summary.deletedRows += 1;
      } else {
        upsertRow("catalog_stock_batches", beforeState);
        summary.updatedRows += 1;
      }
      continue;
    }

    if (entityType === "DAILY_TASK" && action === "UPDATE" && beforeState && beforeState.id) {
      upsertRow("daily_tasks", beforeState);
      summary.updatedRows += 1;
      continue;
    }
  }

  const lateBatchIds = db
    .prepare(
      `
        SELECT id
        FROM catalog_stock_batches
        WHERE julianday(created_at) >= julianday(:cutoff)
      `
    )
    .all({ cutoff: cutoffInput })
    .map((row) => Number(row.id))
    .filter(Boolean);
  for (const batchId of lateBatchIds) {
    deleteById("catalog_stock_batches", batchId);
    summary.deletedRows += 1;
  }

  refreshAllCatalogStockQuantities();
  if (restoreScope !== "stock") {
    recalcAllCashAccounts();
  }

  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(JSON.stringify(summary, null, 2));
