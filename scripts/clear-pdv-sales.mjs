import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEMO_USERS } from "../server/constants.mjs";
import { createAppRepository } from "../server/app-repository.mjs";

function nowIso() {
  return new Date().toISOString();
}

function timestampLabel() {
  return nowIso().replace(/[:.]/g, "-");
}

function readOption(args, name, fallback = "") {
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index < 0) {
    return fallback;
  }
  return args[index + 1] ?? fallback;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function checkpointAndBackupDatabase(dbPath, db) {
  const backupDir = join(dirname(dbPath), "backups");
  const stamp = timestampLabel();
  mkdirSync(backupDir, { recursive: true });

  try {
    db.exec("PRAGMA wal_checkpoint(FULL);");
  } catch {
    // Segue mesmo sem checkpoint.
  }

  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].filter((filePath) => existsSync(filePath));
  for (const filePath of files) {
    const target = join(backupDir, `${stamp}-${filePath.split(/[/\\]/).pop()}`);
    copyFileSync(filePath, target);
  }

  return backupDir;
}

const args = process.argv.slice(2);
const dbPath = resolve(process.cwd(), readOption(args, "db-path", "server/storage/database/crm.sqlite"));
const actorEmail = readOption(args, "actor-email", DEMO_USERS[0].email);
const actorPassword = readOption(args, "actor-password", DEMO_USERS[0].password);
const reportDir = resolve(process.cwd(), "server/storage/reports");

mkdirSync(reportDir, { recursive: true });

const db = new DatabaseSync(dbPath);
let backupDir = "";

try {
  backupDir = checkpointAndBackupDatabase(dbPath, db);
} finally {
  db.close();
}

const repository = createAppRepository({
  dbPath,
  seedDemo: true
});

try {
  const actor = repository.authenticateUser(actorEmail, actorPassword);
  if (!actor) {
    throw new Error(`Nao foi possivel autenticar o ator ${actorEmail}.`);
  }

  const sales = repository.listPosSales({});
  const beforeAccounts = repository.listStoreCashAccounts(repository.getCurrentStore().id);
  const beforeCatalog = repository.listCatalogItems({});

  const removedSales = [];
  for (const sale of sales) {
    const detailedSale = repository.getPosSale(sale.id);
    repository.deletePosSale(sale.id, { _actor: actor });
    removedSales.push({
      id: sale.id,
      code: sale.code,
      store_id: sale.store_id || null,
      store_name: sale.store_name || "",
      total_amount: roundCurrency(sale.total_amount || 0),
      items: (detailedSale?.items || []).map((item) => ({
        catalog_item_id: item.catalog_item_id,
        item_name: item.item_name,
        quantity: Number(item.quantity || 0),
        unit_cost: roundCurrency(item.unit_cost || 0),
        unit_price: roundCurrency(item.unit_price || 0)
      }))
    });
  }

  const afterAccounts = repository.listStoreCashAccounts(repository.getCurrentStore().id);
  const afterCatalog = repository.listCatalogItems({});
  const report = {
    clearedAt: nowIso(),
    dbPath,
    backupDir,
    removedCount: removedSales.length,
    removedSales,
    accountsBefore: beforeAccounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      balance_amount: roundCurrency(account.balance_amount || 0)
    })),
    accountsAfter: afterAccounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      balance_amount: roundCurrency(account.balance_amount || 0)
    })),
    stockRestored: beforeCatalog
      .map((item) => {
        const afterItem = afterCatalog.find((entry) => Number(entry.id) === Number(item.id));
        const beforeQuantity = Number(item.stock_quantity || 0);
        const afterQuantity = Number(afterItem?.stock_quantity || 0);
        if (beforeQuantity === afterQuantity) {
          return null;
        }
        return {
          id: item.id,
          sku: item.sku,
          name: item.name,
          beforeQuantity,
          afterQuantity,
          delta: afterQuantity - beforeQuantity
        };
      })
      .filter(Boolean)
  };

  const reportPath = join(reportDir, `pdv-sales-cleared-${timestampLabel()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
} finally {
  repository.close();
}
