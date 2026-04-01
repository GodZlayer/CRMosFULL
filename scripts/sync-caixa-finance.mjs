import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEMO_USERS } from "../server/constants.mjs";
import { createAppRepository } from "../server/app-repository.mjs";

const OFFICIAL_ACCOUNT_CODES = [
  "CC_PIX_PJ_MAQ_VERM",
  "MAQ_AMARELA_PIX_CEL",
  "CAIXINHA_LOJA",
  "R_COM_DENIO",
  "OUTROS_REGINA",
  "BOLETOS",
  "ARTHUR"
];

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
const workbookPath = resolve(process.cwd(), readOption(args, "workbook", "caixa.ods"));
const companyCode = readOption(args, "company-code", "BRASIL_EXPRESS");
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

  const store = repository.getCurrentStore(companyCode);
  if (!store) {
    throw new Error(`Nenhuma loja ativa foi encontrada para ${companyCode}.`);
  }

  const importResult = repository.importLegacyOds({
    storeId: store.id,
    files: [workbookPath],
    _actor: actor
  });

  const workbookView = repository.getFinanceWorkbookView({ storeId: store.id });
  const allFinanceEntries = repository.listFinanceEntries({ storeId: store.id });
  const allCashMovements = repository.listStoreCashMovements({ storeId: store.id });

  const officialAccounts = (workbookView.accounts || []).filter((account) =>
    OFFICIAL_ACCOUNT_CODES.includes(String(account.code || ""))
  );
  const crmOfficialBalance = roundCurrency(
    officialAccounts.reduce((sum, account) => sum + Number(account.balance_amount || 0), 0)
  );
  const sheetCurrentBalance = roundCurrency(workbookView.cashManagement?.currentBalance?.value || 0);
  const difference = roundCurrency(crmOfficialBalance - sheetCurrentBalance);

  const report = {
    syncedAt: nowIso(),
    dbPath,
    workbookPath,
    backupDir,
    store: {
      id: store.id,
      code: store.code,
      name: store.name
    },
    importResult,
    workbook: {
      name: workbookView.cashManagement?.workbookName || "",
      sheetName: workbookView.cashManagement?.sheetName || "",
      currentBalance: sheetCurrentBalance,
      differenceValue: roundCurrency(workbookView.cashManagement?.topSummary?.differenceValue || 0),
      importedSheets: workbookView.importSummary || []
    },
    crm: {
      officialAccountsCount: officialAccounts.length,
      officialBalance: crmOfficialBalance,
      difference,
      ledgerRows: workbookView.ledger.length,
      entriesAndExpenses: workbookView.entriesAndExpenses.length,
      purchases: workbookView.purchases.length,
      hiddenLegacyFinanceEntries: allFinanceEntries.filter((entry) => !String(entry.source_workbook || "").trim()).length,
      hiddenLegacyCashMovements: allCashMovements.filter((entry) => !String(entry.source_workbook || "").trim()).length
    },
    officialAccounts: officialAccounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      baseline_amount: roundCurrency(account.baseline_amount || 0),
      balance_amount: roundCurrency(account.balance_amount || 0),
      snapshot_source_workbook: account.snapshot_source_workbook || "",
      snapshot_source_sheet: account.snapshot_source_sheet || "",
      snapshot_source_row: account.snapshot_source_row || null
    }))
  };

  const reportPath = join(reportDir, `caixa-finance-sync-${timestampLabel()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  if (difference !== 0) {
    throw new Error(`A sincronizacao do financeiro terminou com diferenca de R$ ${difference.toFixed(2)}. Veja ${reportPath}.`);
  }

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
} finally {
  repository.close();
}
