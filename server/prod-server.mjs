import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppRepository } from "./app-repository.mjs";
import { createApiServer } from "./http.mjs";

const PORT = Number(process.env.PORT || process.env.APP_PORT || process.env.NODE_PORT || 3000);
const AUTO_MYSQL_BACKUP_ENABLED = !["0", "false", "off"].includes(String(process.env.CRM_AUTO_MYSQL_BACKUP_ENABLED || "1").toLowerCase());
const AUTO_MYSQL_BACKUP_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.CRM_AUTO_MYSQL_BACKUP_INTERVAL_MS || 2 * 60 * 60 * 1000) || 2 * 60 * 60 * 1000
);
const currentDir = process.cwd();
const scriptDir = dirname(fileURLToPath(import.meta.url));
const storageCandidates = [
  process.env.CRM_STORAGE_ROOT,
  join(currentDir, "server", "storage"),
  join(currentDir, "data"),
  join(scriptDir, "storage")
].filter(Boolean);
const storageRoot = storageCandidates.find((candidate) => existsSync(candidate)) || join(currentDir, "server", "storage");
const dbPath = process.env.CRM_DB_PATH || join(storageRoot, "database", "crm.sqlite");
const uploadsRoot = process.env.CRM_UPLOADS_ROOT || join(storageRoot, "uploads");
const repository = createAppRepository({ dbPath, uploadsRoot, seedDemo: false });
const apiServer = createApiServer(repository, { uploadsRoot });
const apiHandler = apiServer.listeners("request")[0];
let autoBackupTimer = null;
let backupInFlight = false;
let lastSuccessfulBackupSignature = getDatabaseSignature();

if (typeof apiHandler !== "function") {
  throw new Error("Nao foi possivel inicializar o handler da API.");
}

const staticCandidates = [
  process.env.STATIC_ROOT,
  join(currentDir, "public_html"),
  join(currentDir, "dist"),
  join(currentDir, "public_html", "dist"),
  join(scriptDir, "..", "dist")
].filter(Boolean);

const distRoot = staticCandidates.find((candidate) => existsSync(join(candidate, "index.html"))) || join(currentDir, "public_html");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendFile(response, filePath) {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (!stats || !stats.isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Arquivo nao encontrado.");
    return;
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": stats.size
  });
  createReadStream(filePath).pipe(response);
}

function resolveStaticPath(pathname) {
  const cleaned = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(cleaned).replace(/^([.][.](\\|\/|$))+/, "").replace(/^[/\\]+/, "");
  const candidate = join(distRoot, safePath);
  const stats = statSync(candidate, { throwIfNoEntry: false });
  if (stats?.isFile()) {
    return candidate;
  }

  if (!extname(safePath)) {
    return join(distRoot, "index.html");
  }

  return null;
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) {
    return apiHandler(request, response);
  }

  const filePath = resolveStaticPath(url.pathname);
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Pagina nao encontrada. Static root atual: ${distRoot}`);
    return;
  }

  sendFile(response, filePath);
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.error(`A porta ${PORT} ja esta em uso.`);
    console.error("No CyberPanel, configure a porta da aplicacao em PORT, APP_PORT ou NODE_PORT e reinicie o app.");
    process.exit(1);
  }

  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Servidor de producao ativo em http://127.0.0.1:${PORT}`);
  console.log(`Static root ativo: ${distRoot}`);
  console.log(`Banco SQLite ativo: ${dbPath}`);
  console.log(`Uploads ativos: ${uploadsRoot}`);
  startAutomaticMysqlBackupSchedule();
});

function shutdown() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
  server.close(() => {
    repository.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function getFileSignature(filePath) {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (!stats?.isFile()) {
    return `${filePath}:missing`;
  }
  return `${filePath}:${stats.size}:${Math.trunc(stats.mtimeMs)}`;
}

function getDatabaseSignature() {
  return [getFileSignature(dbPath), getFileSignature(`${dbPath}-wal`)].join("|");
}

async function runAutomaticMysqlBackupIfNeeded() {
  if (!AUTO_MYSQL_BACKUP_ENABLED || backupInFlight) {
    return;
  }

  const currentSignature = getDatabaseSignature();
  if (currentSignature === lastSuccessfulBackupSignature) {
    console.log("Backup MySQL automatico ignorado: base sem alteracoes desde o ultimo envio.");
    return;
  }

  backupInFlight = true;
  try {
    const result = await repository.backupToMysql({});
    lastSuccessfulBackupSignature = currentSignature;
    console.log(`Backup MySQL automatico concluido: ${result.totalRows} linha(s) enviadas para ${result.databaseName}.`);
  } catch (error) {
    console.error(`Falha no backup MySQL automatico: ${error instanceof Error ? error.message : error}`);
  } finally {
    backupInFlight = false;
  }
}

function startAutomaticMysqlBackupSchedule() {
  if (!AUTO_MYSQL_BACKUP_ENABLED) {
    console.log("Backup MySQL automatico desativado por ambiente.");
    return;
  }

  console.log(`Backup MySQL automatico ativo a cada ${Math.round(AUTO_MYSQL_BACKUP_INTERVAL_MS / 3600000)} hora(s), somente com alteracoes na base.`);
  autoBackupTimer = setInterval(() => {
    void runAutomaticMysqlBackupIfNeeded();
  }, AUTO_MYSQL_BACKUP_INTERVAL_MS);
}
