import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const releaseRoot = join(root, "release", "sharedhost");
const sourceStorageRoot = join(root, "server", "storage");
const sourceDbPath = join(sourceStorageRoot, "database", "crm.sqlite");
const sourceUploadsRoot = join(sourceStorageRoot, "uploads");
const legacyWorkbookFiles = [
  join(root, "Serviços 2026.ods"),
  join(root, "26 CX Loja ok em 29 02.ods")
].filter((filePath) => existsSync(filePath));

function runBuild() {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm.cmd run build"], {
      cwd: root,
      stdio: "inherit"
    });
    return;
  }

  execFileSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit"
  });
}

function checkpointDatabaseIfPresent() {
  if (!existsSync(sourceDbPath)) {
    return;
  }

  const db = new DatabaseSync(sourceDbPath);
  try {
    db.exec("PRAGMA wal_checkpoint(FULL);");
  } finally {
    db.close();
  }
}

function importLegacyOdsIntoReleaseIfPresent() {
  const targetDbPath = join(releaseRoot, "server", "storage", "database", "crm.sqlite");
  if (!existsSync(targetDbPath) || !legacyWorkbookFiles.length) {
    return;
  }

  const args = [
    "--experimental-sqlite",
    join(root, "scripts", "import-legacy-ods.mjs"),
    "--db-path",
    targetDbPath,
    "--storage-root",
    join(releaseRoot, "server", "storage"),
    "--no-seed-demo"
  ];
  legacyWorkbookFiles.forEach((filePath) => {
    args.push("--file", filePath);
  });

  execFileSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit"
  });
}

runBuild();
checkpointDatabaseIfPresent();

rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(join(releaseRoot, "public_html"), { recursive: true });
mkdirSync(join(releaseRoot, "server", "storage", "database"), { recursive: true });
mkdirSync(join(releaseRoot, "server", "storage", "uploads"), { recursive: true });
mkdirSync(join(releaseRoot, "scripts"), { recursive: true });

cpSync(join(root, "dist"), join(releaseRoot, "public_html"), { recursive: true });

for (const file of [
  "app-repository.mjs",
  "constants.mjs",
  "domain.mjs",
  "http.mjs",
  "legacy-ods.mjs",
  "prod-server.mjs",
  "repository.mjs",
  "system-transfer.mjs"
]) {
  cpSync(join(root, "server", file), join(releaseRoot, "server", file));
}

for (const file of [
  "build-sharedhost.mjs",
  "clear-data.mjs",
  "dev.mjs",
  "import-legacy-ods.mjs",
  "text-repair.mjs"
]) {
  if (existsSync(join(root, "scripts", file))) {
    cpSync(join(root, "scripts", file), join(releaseRoot, "scripts", file));
  }
}

if (existsSync(sourceDbPath)) {
  cpSync(sourceDbPath, join(releaseRoot, "server", "storage", "database", "crm.sqlite"));
}
if (existsSync(`${sourceDbPath}-shm`)) {
  cpSync(`${sourceDbPath}-shm`, join(releaseRoot, "server", "storage", "database", "crm.sqlite-shm"));
}
if (existsSync(`${sourceDbPath}-wal`)) {
  cpSync(`${sourceDbPath}-wal`, join(releaseRoot, "server", "storage", "database", "crm.sqlite-wal"));
}
if (existsSync(sourceUploadsRoot)) {
  cpSync(sourceUploadsRoot, join(releaseRoot, "server", "storage", "uploads"), { recursive: true });
}

if (existsSync(join(root, "package-lock.json"))) {
  cpSync(join(root, "package-lock.json"), join(releaseRoot, "package-lock.json"));
}

importLegacyOdsIntoReleaseIfPresent();

writeFileSync(
  join(releaseRoot, "package.json"),
  JSON.stringify(
    {
      name: "brasil-express-crm-sharedhost",
      private: true,
      version: "0.1.0",
      type: "module",
      dependencies: {
        mysql2: "^3.20.0"
      },
      scripts: {
        start: "node --experimental-sqlite server/prod-server.mjs"
      }
    },
    null,
    2
  ) + "\n",
  "utf8"
);

writeFileSync(
  join(releaseRoot, "DEPLOY.txt"),
  [
    "Pasta pronta para shared host com Node.js.",
    "",
    "Estrutura deste pacote:",
    "- public_html/: frontend buildado",
    "- server/: API + storage persistente",
    "- scripts/: utilitarios do projeto",
    "- package.json: comando de start",
    "",
  "Comando de inicializacao:",
    "npm install",
    "npm start",
    "",
    "Observacao:",
    "Este projeto usa node:sqlite com a flag --experimental-sqlite.",
    "O host precisa permitir Node com esse recurso ativo.",
    "",
    "Base atual incluida neste pacote:",
    "A base local atual foi copiada para ./server/storage/database/crm.sqlite.",
    "Os uploads atuais foram copiados para ./server/storage/uploads.",
    "",
    "Porta:",
    "Defina PORT, APP_PORT ou NODE_PORT no ambiente do host. Se nao definir, o servidor usa 3000.",
    "",
    "Frontend:",
    "O servidor de producao prioriza ./public_html como raiz estatica.",
    "",
    "Persistencia:",
    "Se voce atualizar o sistema no host sem querer perder dados, preserve ./server/storage."
    ,
    "",
    "Backup MySQL automatico:",
    "O servidor de producao tenta enviar backup para MySQL a cada 2 horas, mas somente se o crm.sqlite ou crm.sqlite-wal tiver mudado desde o ultimo backup bem-sucedido.",
    "Para desativar: CRM_AUTO_MYSQL_BACKUP_ENABLED=0",
    "Para alterar o intervalo: CRM_AUTO_MYSQL_BACKUP_INTERVAL_MS=7200000"
  ].join("\n") + "\n",
  "utf8"
);

console.log(`Pacote de deploy gerado em: ${releaseRoot}`);
