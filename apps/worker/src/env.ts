import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { findRepoRootFrom } from "@ultimate-system/core";

function normalizeOpenClawModelRef(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.includes("/") ? trimmed : `openai/${trimmed}`;
}

export const heartbeatMs = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 3000);
export const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6380";
export const queueConcurrency = Number(process.env.WORKER_QUEUE_CONCURRENCY ?? 2);
export const workerProvider = process.env.WORKER_PROVIDER ?? "deterministic";
export const workerId = process.env.WORKER_ID;
export const workerName = process.env.WORKER_NAME;
export const workerCapabilities = (process.env.WORKER_CAPABILITIES ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
export const verificationBackend = (process.env.WORKER_VERIFICATION_BACKEND ?? "docker") as "docker" | "shell";
export const terminalDockerImage = process.env.TERMINAL_DOCKER_IMAGE ?? "node:22-bookworm";
export const openAiModel = process.env.OPENAI_MODEL ?? "gpt-5.4";
export const openAiResponsesUrl = process.env.OPENAI_RESPONSES_URL;
export const hermesApiHost = process.env.HERMES_API_HOST ?? "127.0.0.1";
export const hermesApiPort = Number(process.env.HERMES_API_PORT ?? 8642);
export const hermesApiUrl = process.env.HERMES_API_URL ?? `http://${hermesApiHost}:${hermesApiPort}/v1/responses`;
export const hermesApiKey = process.env.HERMES_API_KEY ?? "";
export const openclawGatewayHost = process.env.OPENCLAW_GATEWAY_HOST ?? "127.0.0.1";
export const openclawGatewayPort = Number(process.env.OPENCLAW_GATEWAY_PORT ?? 28789);
export const openclawGatewayUrl = process.env.OPENCLAW_GATEWAY_URL ?? `ws://${openclawGatewayHost}:${openclawGatewayPort}`;
export const openclawGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN ?? "ultimate-system-openclaw-dev-key";
export const openclawAgentId = process.env.OPENCLAW_AGENT_ID ?? "ultimate-system";
export const openclawAgentModel = normalizeOpenClawModelRef(process.env.OPENCLAW_AGENT_MODEL)
  ?? normalizeOpenClawModelRef(process.env.OPENAI_MODEL)
  ?? "openai/gpt-4o-mini";
export const hermesModel = process.env.HERMES_MODEL
  ?? (process.env.ANTHROPIC_API_KEY
    ? "claude-sonnet-4-20250514"
    : existsSync(resolve(homedir(), ".codex", "auth.json"))
      ? "gpt-5.4"
      : process.env.OPENAI_API_KEY
        ? "gpt-4o-mini"
        : "gpt-5.4");
export const paperclipUrl = process.env.PAPERCLIP_URL ?? "http://127.0.0.1:3100";
export const reliantAIAgentUrl = process.env.RELIANTAI_AGENT_URL ?? "http://localhost:8082/agent";

const repoRoot = findRepoRootFrom(import.meta.url);
export const dataDir = resolve(repoRoot, process.env.ULTIMATE_SYSTEM_DATA_DIR ?? "./data");
export const databasePath = resolve(
  repoRoot,
  process.env.ULTIMATE_SYSTEM_DB_PATH ?? "./data/ultimate-system.db"
);
export const openclawHomeDir = resolve(
  repoRoot,
  process.env.OPENCLAW_HOME_DIR ?? "./data/openclaw-home"
);
