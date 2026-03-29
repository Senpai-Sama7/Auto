import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { findRepoRootFrom } from "./paths.js";

const execFileAsync = promisify(execFile);
const repoRoot = findRepoRootFrom(import.meta.url);

export type OpenClawCliOptions = {
  rootDir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  expectFinal?: boolean;
};

export function resolveOpenClawRoot(rootDir = repoRoot): string {
  return resolve(rootDir, ".cache/upstreams/openclaw");
}

export function resolveOpenClawEntry(rootDir = repoRoot): string {
  return resolve(resolveOpenClawRoot(rootDir), "openclaw.mjs");
}

export function resolveOpenClawDist(rootDir = repoRoot): string {
  return resolve(resolveOpenClawRoot(rootDir), "dist");
}

export function resolveOpenClawHome(rootDir = repoRoot): string {
  return resolve(rootDir, process.env.OPENCLAW_HOME_DIR ?? "./data/openclaw-home");
}

export function resolveOpenClawGatewayUrl(): string {
  const explicitUrl = process.env.OPENCLAW_GATEWAY_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const host = process.env.OPENCLAW_GATEWAY_HOST ?? "127.0.0.1";
  const port = Number(process.env.OPENCLAW_GATEWAY_PORT ?? 28789);
  return `ws://${host}:${port}`;
}

export function resolveOpenClawHttpBase(gatewayUrl = resolveOpenClawGatewayUrl()): string {
  const resolved = new URL(gatewayUrl);
  if (resolved.protocol === "ws:") {
    resolved.protocol = "http:";
  } else if (resolved.protocol === "wss:") {
    resolved.protocol = "https:";
  }
  return resolved.origin;
}

export function buildOpenClawEnv(
  overrides: NodeJS.ProcessEnv = {},
  rootDir = repoRoot
): NodeJS.ProcessEnv {
  const openClawRoot = resolveOpenClawRoot(rootDir);
  const merged = {
    ...process.env,
    ...overrides
  };
  const existingPath = merged.PATH ?? "";
  const pathEntries = existingPath
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => entry !== openClawRoot);

  return {
    ...merged,
    OPENCLAW_HOME: overrides.OPENCLAW_HOME ?? resolveOpenClawHome(rootDir),
    OPENCLAW_GATEWAY_TOKEN: overrides.OPENCLAW_GATEWAY_TOKEN ?? process.env.OPENCLAW_GATEWAY_TOKEN,
    OPENCLAW_GATEWAY_URL: overrides.OPENCLAW_GATEWAY_URL ?? resolveOpenClawGatewayUrl(),
    OPENCLAW_SKIP_CHANNELS: overrides.OPENCLAW_SKIP_CHANNELS ?? process.env.OPENCLAW_SKIP_CHANNELS ?? "1",
    PATH: [openClawRoot, ...pathEntries].join(delimiter)
  };
}

export async function runOpenClawCli(
  args: string[],
  options: OpenClawCliOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const rootDir = options.rootDir ?? repoRoot;
  const entry = resolveOpenClawEntry(rootDir);
  if (!existsSync(entry)) {
    throw new Error(`OpenClaw entrypoint is missing at ${entry}. Run ./scripts/setup.sh first.`);
  }

  return await execFileAsync(process.execPath, [entry, ...args], {
    cwd: options.cwd ?? rootDir,
    env: buildOpenClawEnv(options.env, rootDir),
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: 20 * 1024 * 1024
  });
}

export async function runOpenClawJson<T>(
  args: string[],
  options: OpenClawCliOptions = {}
): Promise<T> {
  const { stdout, stderr } = await runOpenClawCli(args, options);
  return parseOpenClawJsonOutput<T>(stdout, stderr);
}

function resolveGatewayUrl(env: NodeJS.ProcessEnv | undefined): string {
  return env?.OPENCLAW_GATEWAY_URL?.trim() || resolveOpenClawGatewayUrl();
}

function resolveGatewayToken(env: NodeJS.ProcessEnv | undefined): string | null {
  const token = env?.OPENCLAW_GATEWAY_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

export function parseOpenClawJsonOutput<T>(stdout: string, stderr: string): T {
  const candidates = [stdout.trim(), stderr.trim()].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      const extracted = extractJsonPayload(candidate);
      if (!extracted) {
        continue;
      }
      try {
        return JSON.parse(extracted) as T;
      } catch {
        // Try the next stream. Some upstream commands emit JSON on stderr.
      }
    }
  }

  const preview = candidates.map((candidate, index) => `stream${index + 1}: ${candidate.slice(0, 200)}`).join(" | ");
  throw new SyntaxError(preview ? `Unable to parse OpenClaw JSON output. ${preview}` : "Unexpected end of JSON input");
}

function extractJsonPayload(candidate: string): string | null {
  const objectStart = candidate.indexOf("{");
  const arrayStart = candidate.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (starts.length === 0) {
    return null;
  }
  const start = Math.min(...starts);
  const objectEnd = candidate.lastIndexOf("}");
  const arrayEnd = candidate.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);
  if (end < start) {
    return null;
  }
  return candidate.slice(start, end + 1);
}

export function buildOpenClawGatewayCallArgs(params: {
  method: string;
  env?: NodeJS.ProcessEnv;
  payload?: unknown;
  expectFinal?: boolean;
}): string[] {
  const args = [
    "gateway",
    "call",
    params.method,
    "--url",
    resolveGatewayUrl(params.env)
  ];
  const token = resolveGatewayToken(params.env);
  if (token) {
    args.push("--token", token);
  }
  if (params.payload !== undefined) {
    args.push("--params", JSON.stringify(params.payload));
  }
  args.push("--json");
  if (params.expectFinal) {
    args.push("--expect-final");
  }
  return args;
}

export async function callOpenClawGatewayJson<T>(
  method: string,
  params: unknown,
  options: OpenClawCliOptions = {}
): Promise<T> {
  const rootDir = options.rootDir ?? repoRoot;
  const env = buildOpenClawEnv(options.env, rootDir);
  const args = buildOpenClawGatewayCallArgs({
    method,
    env,
    payload: params,
    expectFinal: options.expectFinal
  });
  return await runOpenClawJson<T>(args, {
    ...options,
    rootDir,
    env
  });
}

export async function ensureOpenClawAgent(params: {
  agentId: string;
  workspaceDir: string;
  model?: string;
  rootDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const agents = await runOpenClawJson<Array<{
    id?: string;
    workspace?: string;
  }>>(["agents", "list", "--json"], {
    rootDir: params.rootDir,
    env: params.env
  });

  const existing = agents.find((candidate) => candidate.id === params.agentId) ?? null;
  if (existing) {
    if (typeof existing.workspace === "string" && resolve(existing.workspace) !== resolve(params.workspaceDir)) {
      throw new Error(
        `OpenClaw agent "${params.agentId}" already exists with workspace ${existing.workspace}; expected ${params.workspaceDir}.`
      );
    }
    return;
  }

  const args = [
    "agents",
    "add",
    params.agentId,
    "--workspace",
    params.workspaceDir,
    "--non-interactive",
    "--json"
  ];
  if (params.model) {
    args.push("--model", params.model);
  }

  await runOpenClawCli(args, {
    rootDir: params.rootDir,
    env: params.env,
    timeoutMs: 120_000
  });
}

type OpenClawGatewayCatalogTool = {
  id: string;
  label: string;
  description: string;
  source: "core" | "plugin";
  pluginId?: string;
  optional?: boolean;
  defaultProfiles?: string[];
};

type OpenClawGatewayCatalogGroup = {
  id: string;
  label: string;
  source: "core" | "plugin";
  pluginId?: string;
  tools: OpenClawGatewayCatalogTool[];
};

type OpenClawGatewayCatalogPayload = {
  agentId?: string;
  profiles: Array<{ id: string; label: string }>;
  groups: OpenClawGatewayCatalogGroup[];
};

export type OpenClawToolCatalog = {
  agentId: string | null;
  sections: Array<{
    id: string;
    label: string;
    source: "core" | "plugin";
    pluginId?: string;
    tools: Array<{
      id: string;
      label: string;
      description: string;
      profiles: string[];
      source: "core" | "plugin";
      pluginId?: string;
      optional?: boolean;
    }>;
  }>;
  groups: Record<string, string[]>;
  profiles: Array<{ id: string; label: string }>;
};

export function normalizeOpenClawToolCatalog(catalog: OpenClawGatewayCatalogPayload): OpenClawToolCatalog {
  return {
    agentId: catalog.agentId ?? null,
    sections: catalog.groups.map((group) => ({
      id: group.id,
      label: group.label,
      source: group.source,
      ...(group.pluginId ? { pluginId: group.pluginId } : {}),
      tools: group.tools.map((tool) => ({
        id: tool.id,
        label: tool.label,
        description: tool.description,
        profiles: tool.defaultProfiles ?? [],
        source: tool.source,
        ...(tool.pluginId ? { pluginId: tool.pluginId } : {}),
        ...(tool.optional !== undefined ? { optional: tool.optional } : {})
      }))
    })),
    groups: Object.fromEntries(
      catalog.groups.map((group) => [group.id, group.tools.map((tool) => tool.id)])
    ),
    profiles: catalog.profiles.map((profile) => ({
      id: profile.id,
      label: profile.label
    }))
  };
}

export async function getOpenClawToolCatalog(options: OpenClawCliOptions = {}): Promise<OpenClawToolCatalog> {
  const rootDir = options.rootDir ?? repoRoot;
  const env = buildOpenClawEnv(options.env, rootDir);
  const catalog = await callOpenClawGatewayJson<OpenClawGatewayCatalogPayload>(
    "tools.catalog",
    { includePlugins: true },
    {
      ...options,
      rootDir,
      env
    }
  );
  return normalizeOpenClawToolCatalog(catalog);
}

export async function getOpenClawSkills(
  options: OpenClawCliOptions = {}
): Promise<{
  workspaceDir: string;
  managedSkillsDir: string;
  skills: Array<{
    name: string;
    description: string;
    emoji?: string;
    eligible: boolean;
    disabled: boolean;
    blockedByAllowlist: boolean;
    source: string;
    bundled?: boolean;
    primaryEnv?: string;
    homepage?: string;
    missing: {
      bins: string[];
      anyBins: string[];
      env: string[];
      config: string[];
      os: string[];
    };
  }>;
}> {
  return await runOpenClawJson(["skills", "list", "--json"], options);
}

export async function getOpenClawStatus(options: OpenClawCliOptions = {}): Promise<{
  gateway: unknown;
  skillCount: number;
  toolCount: number;
  groupCount: number;
}> {
  const [gateway, skills, tools] = await Promise.all([
    callOpenClawGatewayJson<unknown>("health", {}, options),
    getOpenClawSkills(options),
    getOpenClawToolCatalog(options)
  ]);

  return {
    gateway,
    skillCount: skills.skills.length,
    toolCount: tools.sections.reduce((sum, section) => sum + section.tools.length, 0),
    groupCount: Object.keys(tools.groups).length
  };
}
