import { spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    log: null,
    pid: null,
    healthUrl: null,
    timeoutMs: 90_000,
    intervalMs: 1_000,
    command: []
  };

  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === "--") {
      options.command = argv.slice(index + 1);
      break;
    }
    if (arg === "--cwd") {
      options.cwd = argv[index + 1] ?? options.cwd;
      index += 2;
      continue;
    }
    if (arg === "--log") {
      options.log = argv[index + 1] ?? null;
      index += 2;
      continue;
    }
    if (arg === "--pid") {
      options.pid = argv[index + 1] ?? null;
      index += 2;
      continue;
    }
    if (arg === "--health-url") {
      options.healthUrl = argv[index + 1] ?? null;
      index += 2;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = Number(argv[index + 1] ?? options.timeoutMs);
      index += 2;
      continue;
    }
    if (arg === "--interval-ms") {
      options.intervalMs = Number(argv[index + 1] ?? options.intervalMs);
      index += 2;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.command.length === 0) {
    throw new Error("No command provided. Use -- <command> [args...]");
  }

  return options;
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms) {
  await new Promise((resolveTimer) => setTimeout(resolveTimer, ms));
}

async function waitForHealth(url, timeoutMs, intervalMs, pid) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      throw new Error(`Process ${pid} exited before ${url} became healthy.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling until deadline
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for health check: ${url}`);
}

const options = parseArgs(process.argv.slice(2));
const cwd = resolve(options.cwd);
const logPath = options.log ? resolve(options.log) : null;
const pidPath = options.pid ? resolve(options.pid) : null;

if (pidPath) {
  mkdirSync(dirname(pidPath), { recursive: true });
  try {
    const currentPid = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
    if (isProcessAlive(currentPid)) {
      if (options.healthUrl) {
        const response = await fetch(options.healthUrl).catch(() => null);
        if (response?.ok) {
          console.log(`service already running with pid ${currentPid}`);
          process.exit(0);
        }
      } else {
        console.log(`service already running with pid ${currentPid}`);
        process.exit(0);
      }
    } else {
      rmSync(pidPath, { force: true });
    }
  } catch {
    // no existing pid file or unreadable content
  }
}

const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
let logFd = openSync(nullDevice, "a");
if (logPath) {
  mkdirSync(dirname(logPath), { recursive: true });
  logFd = openSync(logPath, "a");
}

const child = spawn(options.command[0], options.command.slice(1), {
  cwd,
  env: process.env,
  detached: true,
  stdio: ["ignore", logFd, logFd]
});
child.unref();

if (pidPath) {
  writeFileSync(pidPath, `${child.pid}\n`);
}

if (options.healthUrl) {
  try {
    await waitForHealth(options.healthUrl, options.timeoutMs, options.intervalMs, child.pid ?? 0);
  } catch (error) {
    if (child.pid && isProcessAlive(child.pid)) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // ignore cleanup failures
      }
    }
    throw error;
  }
}

console.log(`started pid ${child.pid ?? "unknown"}`);
