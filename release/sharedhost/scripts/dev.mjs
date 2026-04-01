import { execFile, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [];
const defaultApiPort = Number(process.env.CRM_API_PORT || process.env.PORT || 3001);
const defaultWebPort = Number(process.env.CRM_WEB_PORT || 5173);
const sessionFile = join(process.cwd(), ".dev-session.json");
const currentSession = {
  ownerPid: process.pid,
  childPids: [],
  startedAt: new Date().toISOString(),
  apiPort: null,
  webPort: null
};

function persistSession() {
  writeFileSync(sessionFile, JSON.stringify(currentSession, null, 2));
}

function cleanupSessionFile() {
  if (!existsSync(sessionFile)) {
    return;
  }

  try {
    const savedSession = JSON.parse(readFileSync(sessionFile, "utf8"));
    if (savedSession?.ownerPid === process.pid) {
      rmSync(sessionFile, { force: true });
    }
  } catch {
    rmSync(sessionFile, { force: true });
  }
}

function killProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid || pid === process.pid) {
      resolve();
      return;
    }

    if (process.platform === "win32") {
      execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => resolve());
      return;
    }

    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore stale pid entries from previous sessions.
    }
    resolve();
  });
}

function killProcessTreeSync(pid) {
  if (!pid || pid === process.pid) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // Ignore stale pid entries from previous sessions.
    }
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Ignore stale pid entries from previous sessions.
  }
}

async function closePreviousSession() {
  if (!existsSync(sessionFile)) {
    return;
  }

  try {
    const savedSession = JSON.parse(readFileSync(sessionFile, "utf8"));
    const pids = [...new Set([savedSession?.ownerPid, ...(savedSession?.childPids || [])])]
      .map((pid) => Number(pid))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);

    if (pids.length === 0) {
      rmSync(sessionFile, { force: true });
      return;
    }

    console.log(`Encerrando a sessao anterior do ambiente local (${pids.join(", ")}).`);
    for (const pid of pids) {
      await killProcessTree(pid);
    }
  } catch {
    // Ignore malformed lock files and replace them with a clean session.
  }

  rmSync(sessionFile, { force: true });
}

function run(scriptName, envOverrides = {}) {
  const command = process.platform === "win32" ? "cmd.exe" : npmCommand;
  const args = process.platform === "win32" ? ["/d", "/s", "/c", `${npmCommand} run ${scriptName}`] : ["run", scriptName];

  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      ...envOverrides
    },
    shell: false
  });

  children.push(child);
  if (child.pid) {
    currentSession.childPids = [...new Set([...currentSession.childPids, child.pid])];
    persistSession();
  }

  child.on("error", () => {
    shutdown(1);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      shutdown(code ?? 1);
    }
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed && child.pid) {
      killProcessTreeSync(child.pid);
    }
  }

  cleanupSessionFile();
  process.exit(code);
}

async function isHealthyApi(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1200)
    });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json();
    return payload?.ok === true;
  } catch {
    return false;
  }
}

function isPortAvailable(port) {
  function probeHost(host) {
    return new Promise((resolve) => {
      const probe = createServer();
      probe.unref();

      probe.once("error", () => {
        resolve(false);
      });

      probe.listen(port, host, () => {
        probe.close(() => resolve(true));
      });
    });
  }

  return Promise.all([probeHost("127.0.0.1"), probeHost("0.0.0.0")]).then((results) => results.every(Boolean));
}

async function findAvailablePort(startPort, attempts = 20) {
  for (let port = startPort; port < startPort + attempts; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`Nenhuma porta livre encontrada a partir de ${startPort}.`);
}

async function resolveApiPort() {
  if (await isPortAvailable(defaultApiPort)) {
    return {
      port: defaultApiPort,
      reusedExistingApi: false
    };
  }

  const fallbackPort = await findAvailablePort(defaultApiPort + 1);
  if (await isHealthyApi(defaultApiPort)) {
    console.log(
      `Ja existe uma API respondendo em ${defaultApiPort}, mas esta sessao vai subir uma nova instancia em http://127.0.0.1:${fallbackPort} para garantir codigo atualizado.`
    );
  } else {
    console.log(`Porta ${defaultApiPort} ocupada por outro processo. Subindo a API local em http://127.0.0.1:${fallbackPort}.`);
  }

  return {
    port: fallbackPort,
    reusedExistingApi: false
  };
}

async function resolveWebPort() {
  if (await isPortAvailable(defaultWebPort)) {
    return defaultWebPort;
  }

  const fallbackPort = await findAvailablePort(defaultWebPort + 1);
  console.log(`Porta ${defaultWebPort} ocupada por outro processo. Subindo o Vite em http://127.0.0.1:${fallbackPort}.`);
  return fallbackPort;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  await closePreviousSession();
  persistSession();

  const { port } = await resolveApiPort();
  const webPort = await resolveWebPort();
  currentSession.apiPort = port;
  currentSession.webPort = webPort;
  persistSession();
  console.log(`Iniciando nova sessao local com API em http://127.0.0.1:${port} e web em http://127.0.0.1:${webPort}.`);
  console.log(`Acesse o CRM em http://127.0.0.1:${webPort} .`);
  const sharedEnv = {
    CRM_API_PORT: String(port),
    CRM_WEB_PORT: String(webPort)
  };

  run("dev:api", { ...sharedEnv, PORT: String(port) });
  run("dev:web", sharedEnv);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
});

