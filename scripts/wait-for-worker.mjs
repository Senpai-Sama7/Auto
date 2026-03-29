import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const workerId = process.argv[2];
if (!workerId) {
  throw new Error("Usage: node scripts/wait-for-worker.mjs <workerId> [databasePath]");
}

const databasePath = resolve(process.argv[3] ?? process.env.ULTIMATE_SYSTEM_DB_PATH ?? "./data/ultimate-system.db");
const timeoutMs = Number(process.env.WORKER_WAIT_TIMEOUT_MS ?? 60_000);
const intervalMs = Number(process.env.WORKER_WAIT_INTERVAL_MS ?? 1_000);
const deadline = Date.now() + timeoutMs;
const db = new DatabaseSync(databasePath, { defensive: true });

while (Date.now() < deadline) {
  try {
    const row = db.prepare("SELECT id, last_heartbeat_at FROM workers WHERE id = ?").get(workerId);
    if (row && typeof row === "object" && row.last_heartbeat_at) {
      console.log(`worker ${workerId} heartbeat=${row.last_heartbeat_at}`);
      db.close();
      process.exit(0);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("no such table")) {
      db.close();
      throw error;
    }
  }
  await new Promise((resolveTimer) => setTimeout(resolveTimer, intervalMs));
}

db.close();
throw new Error(`Timed out waiting for worker ${workerId} to register and heartbeat.`);
