import { spawn } from "node:child_process";

const vitePort = Number(process.env.CRM_WEB_PORT || 5173);
const viteBin = process.platform === "win32" ? "node_modules\\vite\\bin\\vite.js" : "node_modules/vite/bin/vite.js";

const child = spawn(process.execPath, [viteBin, "--host", "0.0.0.0", "--port", String(vitePort)], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
  shell: false
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
