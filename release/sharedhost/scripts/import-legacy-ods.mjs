import { resolve } from "node:path";
import { createAppRepository } from "../server/app-repository.mjs";
import { DEMO_USERS } from "../server/constants.mjs";

function readOption(args, name, fallback = "") {
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index < 0) {
    return fallback;
  }
  return args[index + 1] ?? fallback;
}

function readMultiOption(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === `--${name}` && args[index + 1]) {
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
}

function hasFlag(args, name) {
  return args.includes(`--${name}`);
}

const args = process.argv.slice(2);
const dbPath = readOption(args, "db-path");
const storageRoot = readOption(args, "storage-root");
const uploadsRoot = readOption(args, "uploads-root");
const companyCode = readOption(args, "company-code", "BRASIL_EXPRESS");
const actorEmail = readOption(args, "actor-email", DEMO_USERS[0].email);
const actorPassword = readOption(args, "actor-password", DEMO_USERS[0].password);
const seedDemo = !hasFlag(args, "no-seed-demo");
const files = readMultiOption(args, "file").map((filePath) => resolve(process.cwd(), filePath));

const repository = createAppRepository({
  dbPath: dbPath || undefined,
  storageRoot: storageRoot || undefined,
  uploadsRoot: uploadsRoot || undefined,
  seedDemo
});

try {
  const actor = repository.authenticateUser(actorEmail, actorPassword);
  if (!actor) {
    throw new Error(`Não foi possível autenticar o ator ${actorEmail}.`);
  }

  const store = repository.getCurrentStore(companyCode);
  if (!store) {
    throw new Error(`Nenhuma loja ativa foi encontrada para ${companyCode}.`);
  }

  const result = repository.importLegacyOds({
    storeId: store.id,
    files,
    _actor: actor
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  repository.close();
}
