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
const workbookPath = resolve(process.cwd(), readOption(args, "file", "tarefas.ods"));
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

  const store = repository.getCurrentStore("BRASIL_EXPRESS");
  const beforeTasks = repository.listTasks({});
  const importResult = repository.importLegacyOds({
    storeId: store.id,
    files: [workbookPath],
    _actor: actor
  });
  const afterTasks = repository.listTasks({});

  const queueSummary = Object.fromEntries(
    afterTasks.reduce((map, task) => {
      const key = String(task.legacy_queue_code || "SEM_GUIA").trim() || "SEM_GUIA";
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map())
  );

  const statusSummary = Object.fromEntries(
    afterTasks.reduce((map, task) => {
      const key = String(task.status || "SEM_STATUS").trim() || "SEM_STATUS";
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map())
  );

  const report = {
    syncedAt: nowIso(),
    dbPath,
    workbookPath,
    backupDir,
    tasksBefore: beforeTasks.length,
    tasksAfter: afterTasks.length,
    importResult,
    queueSummary,
    statusSummary,
    sample: afterTasks.slice(0, 12).map((task) => ({
      id: task.id,
      title: task.title,
      client_name: task.client_name,
      legacy_queue_code: task.legacy_queue_code,
      legacy_queue_label: task.legacy_queue_label,
      legacy_status_label: task.legacy_status_label,
      status: task.status,
      value_label: task.value_label || "",
      source_sheet: task.source_sheet,
      source_row: task.source_row
    }))
  };

  const reportPath = join(reportDir, `tarefas-sync-${timestampLabel()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
} finally {
  repository.close();
}
