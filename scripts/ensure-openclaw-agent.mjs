import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import path from "node:path";

const [rootDir, openclawDir, agentId, agentModel] = process.argv.slice(2);

if (!rootDir || !openclawDir || !agentId) {
  throw new Error("Usage: node scripts/ensure-openclaw-agent.mjs <rootDir> <openclawDir> <agentId> [agentModel]");
}

function runJson(args) {
  const stdout = execFileSync(process.execPath, [resolve(openclawDir, "openclaw.mjs"), ...args], {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return JSON.parse(stdout);
}

function normalizeModelRef(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.includes("/") ? trimmed : `openai/${trimmed}`;
}

function resolveConfigPath() {
  const openclawHome = process.env.OPENCLAW_HOME;
  if (!openclawHome) {
    throw new Error("OPENCLAW_HOME must be set before ensuring the OpenClaw agent.");
  }
  return path.join(openclawHome, ".openclaw", "openclaw.json");
}

function reconcileAgentConfig(configPath, agentIdToFind, workspaceDir, requestedModel) {
  if (!fs.existsSync(configPath)) {
    return;
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);
  
  let changed = false;
  
  // Inject Ultimate System MCP Servers
  config.mcp ??= {};
  config.mcp.servers ??= {};
  
  const mcpDir = path.join(workspaceDir, "mcp");
  if (fs.existsSync(mcpDir)) {
    const nodeMcpServers = [
      "devintelligence-mcp-server",
      "omni-mcp-server",
      "choreographer-mcp-server"
    ];
    
    for (const serverName of nodeMcpServers) {
      const serverPath = path.join(mcpDir, serverName, "dist", "index.js");
      if (fs.existsSync(serverPath)) {
        if (config.mcp.servers[serverName]?.args?.[0] !== serverPath) {
          config.mcp.servers[serverName] = {
            command: "node",
            args: [serverPath]
          };
          changed = true;
        }
      }
    }

    const pythonMcpServers = [
      "omega-system",
      "omega-docker",
      "omega-security",
      "omega-network"
    ];

    for (const serverName of pythonMcpServers) {
      const serverPath = path.join(mcpDir, "omega-mcp-servers", serverName, "src", "server.py");
      if (fs.existsSync(serverPath)) {
        if (config.mcp.servers[serverName]?.args?.[0] !== serverPath) {
          config.mcp.servers[serverName] = {
            command: "python",
            args: [serverPath]
          };
          changed = true;
        }
      }
    }
  }

  const list = Array.isArray(config?.agents?.list) ? config.agents.list : [];
  const index = list.findIndex((candidate) => candidate?.id === agentIdToFind);
  if (typeof list[index].workspace === "string" && resolve(list[index].workspace) !== resolve(workspaceDir)) {
    throw new Error(
      `OpenClaw agent "${agentIdToFind}" already exists with workspace ${list[index].workspace}; expected ${workspaceDir}.`
    );
  }

  if (requestedModel && list[index].model !== requestedModel) {
    list[index] = {
      ...list[index],
      model: requestedModel
    };
    changed = true;
  }

  if (requestedModel) {
    config.agents ??= {};
    config.agents.defaults ??= {};
    config.agents.defaults.models ??= {};
    if (!config.agents.defaults.models[requestedModel]) {
      config.agents.defaults.models[requestedModel] = {};
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }
}

const agents = runJson(["agents", "list", "--json"]);
if (!Array.isArray(agents)) {
  throw new Error("OpenClaw agents list did not return an array.");
}

const existing = agents.find((candidate) => candidate?.id === agentId) ?? null;
const requestedModel = normalizeModelRef(agentModel);
if (existing) {
  if (typeof existing.workspace === "string" && resolve(existing.workspace) !== resolve(rootDir)) {
    throw new Error(
      `OpenClaw agent "${agentId}" already exists with workspace ${existing.workspace}; expected ${rootDir}.`
    );
  }
  reconcileAgentConfig(resolveConfigPath(), agentId, rootDir, requestedModel);
  process.exit(0);
}

const addArgs = [
  "agents",
  "add",
  agentId,
  "--workspace",
  rootDir,
  "--non-interactive",
  "--json"
];

if (requestedModel) {
  addArgs.push("--model", requestedModel);
}

execFileSync(process.execPath, [resolve(openclawDir, "openclaw.mjs"), ...addArgs], {
  cwd: rootDir,
  env: process.env,
  stdio: "ignore",
  maxBuffer: 20 * 1024 * 1024
});

reconcileAgentConfig(resolveConfigPath(), agentId, rootDir, requestedModel);
