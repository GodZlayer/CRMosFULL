import { join } from "node:path";
import { createAppRepository } from "./app-repository.mjs";
import { createApiServer } from "./http.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3001);
const uploadsRoot = join(process.cwd(), "server", "storage", "uploads");

const repository = createAppRepository({
  uploadsRoot
});

if (process.argv.includes("--seed-only")) {
  console.log("Banco SQLite preparado com dados demo.");
  repository.close();
  process.exit(0);
}

const server = createApiServer(repository, { uploadsRoot });

server.on("error", (error) => {
  console.error(error instanceof Error ? error.message : error);
  repository.close();
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`API local ativa em http://${HOST}:${PORT}`);
});

process.on("SIGINT", () => {
  server.close(() => {
    repository.close();
    process.exit(0);
  });
});
