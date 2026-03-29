import { resolve } from "node:path";
import { findRepoRootFrom } from "@ultimate-system/core";

export const apiPort = Number(process.env.API_PORT ?? 4100);
const repoRoot = findRepoRootFrom(import.meta.url);
export const dataDir = resolve(repoRoot, process.env.ULTIMATE_SYSTEM_DATA_DIR ?? "./data");
export const databasePath = resolve(
  repoRoot,
  process.env.ULTIMATE_SYSTEM_DB_PATH ?? "./data/ultimate-system.db"
);
export const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6380";
export const paperclipUrl = process.env.PAPERCLIP_URL ?? "http://127.0.0.1:3100";
export const openclawGatewayHost = process.env.OPENCLAW_GATEWAY_HOST ?? "127.0.0.1";
export const openclawGatewayPort = Number(process.env.OPENCLAW_GATEWAY_PORT ?? 28789);
export const openclawGatewayUrl = process.env.OPENCLAW_GATEWAY_URL ?? `ws://${openclawGatewayHost}:${openclawGatewayPort}`;
export const openclawGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN ?? "ultimate-system-openclaw-dev-key";
export const openclawAgentId = process.env.OPENCLAW_AGENT_ID ?? "ultimate-system";
export const openclawAgentModel = process.env.OPENCLAW_AGENT_MODEL ?? "gpt-5.4";
export const openclawHomeDir = resolve(repoRoot, process.env.OPENCLAW_HOME_DIR ?? "./data/openclaw-home");
const parseCsv = (value: string | undefined, fallback: string[]): string[] => {
  const next = value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  return next.length > 0 ? next : fallback;
};
export const authRpName = process.env.AUTH_RP_NAME ?? "Ultimate System";
export const authRpIds = parseCsv(process.env.AUTH_RP_IDS, ["localhost"]);
export const authRpId = authRpIds[0] ?? "localhost";
export const authOrigins = parseCsv(process.env.AUTH_ORIGINS, ["http://localhost:4173"]);
export const adminEmail = process.env.ULTIMATE_SYSTEM_ADMIN_EMAIL ?? "admin@ultimate-system.local";
export const adminPassword = process.env.ULTIMATE_SYSTEM_ADMIN_PASSWORD ?? "change-this-password";
export const adminName = process.env.ULTIMATE_SYSTEM_ADMIN_NAME ?? "Local Admin";
export const requesterEmail = process.env.ULTIMATE_SYSTEM_REQUESTER_EMAIL ?? "requester@ultimate-system.local";
export const requesterPassword = process.env.ULTIMATE_SYSTEM_REQUESTER_PASSWORD ?? "requester-password";
export const requesterName = process.env.ULTIMATE_SYSTEM_REQUESTER_NAME ?? "Local Requester";
export const approverEmail = process.env.ULTIMATE_SYSTEM_APPROVER_EMAIL ?? "approver@ultimate-system.local";
export const approverPassword = process.env.ULTIMATE_SYSTEM_APPROVER_PASSWORD ?? "approver-password";
export const approverName = process.env.ULTIMATE_SYSTEM_APPROVER_NAME ?? "Local Approver";
export const viewerEmail = process.env.ULTIMATE_SYSTEM_VIEWER_EMAIL ?? "viewer@ultimate-system.local";
export const viewerPassword = process.env.ULTIMATE_SYSTEM_VIEWER_PASSWORD ?? "viewer-password";
export const viewerName = process.env.ULTIMATE_SYSTEM_VIEWER_NAME ?? "Local Viewer";

export const reliantAiAuthUrl = process.env.RELIANTAI_AUTH_URL;
export const reliantAiEventBusUrl = process.env.RELIANTAI_EVENT_BUS_URL;
