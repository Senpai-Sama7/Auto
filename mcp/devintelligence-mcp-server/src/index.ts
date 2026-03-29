#!/usr/bin/env node
/**
 * DevIntelligence MCP Server
 * 
 * The ultimate Development Environment Intelligence MCP Server.
 * Provides AI-powered development capabilities including:
 * - File system operations (read, write, search)
 * - Shell command execution
 * - GitHub integration (repos, issues, PRs)
 * - Database queries (SQLite)
 * - Code search and analysis
 * 
 * Environment Variables:
 *   GITHUB_TOKEN - GitHub personal access token for API access
 *   TRANSPORT - 'stdio' or 'http' (default: stdio)
 *   PORT - HTTP port when using http transport (default: 3000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

// Import tool registrations
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerShellTools } from "./tools/shell.js";
import { registerGitHubTools } from "./tools/github.js";
import { registerDatabaseTools } from "./tools/database.js";
import { registerSearchTools } from "./tools/search.js";

// Server metadata
const SERVER_NAME = "devintelligence-mcp-server";
const SERVER_VERSION = "1.0.0";

/**
 * Create and configure the MCP server with all tools
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  // Register all tool categories
  registerFilesystemTools(server);
  registerShellTools(server);
  registerGitHubTools(server);
  registerDatabaseTools(server);
  registerSearchTools(server);

  return server;
}

/**
 * Run server with stdio transport (for local use)
 */
async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  
  // Log to stderr (stdout is reserved for MCP protocol)
  console.error(`✓ DevIntelligence MCP Server running via stdio`);
  console.error(`✓ Server: ${SERVER_NAME} v${SERVER_VERSION}`);
  console.error(`✓ Tools registered: filesystem, shell, github, database, search`);
  
  if (!process.env.GITHUB_TOKEN) {
    console.error(`⚠ GITHUB_TOKEN not set - GitHub tools will have limited rate limits`);
  }
}

/**
 * Run server with HTTP transport (for remote use)
 */
async function runHTTP(): Promise<void> {
  const server = createServer();
  const app = express();
  
  app.use(express.json());
  
  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({
      status: "healthy",
      server: SERVER_NAME,
      version: SERVER_VERSION,
      timestamp: new Date().toISOString()
    });
  });
  
  // MCP endpoint
  app.post("/mcp", async (req, res) => {
    // Create new transport for each request (stateless, prevents ID collisions)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    
    res.on("close", () => transport.close());
    
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  
  const port = parseInt(process.env.PORT || "3000", 10);
  
  app.listen(port, () => {
    console.error(`✓ DevIntelligence MCP Server running on http://localhost:${port}`);
    console.error(`✓ MCP endpoint: POST http://localhost:${port}/mcp`);
    console.error(`✓ Health check: GET http://localhost:${port}/health`);
    console.error(`✓ Server: ${SERVER_NAME} v${SERVER_VERSION}`);
    
    if (!process.env.GITHUB_TOKEN) {
      console.error(`⚠ GITHUB_TOKEN not set - GitHub tools will have limited rate limits`);
    }
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const transport = process.env.TRANSPORT || "stdio";
  
  try {
    if (transport === "http") {
      await runHTTP();
    } else {
      await runStdio();
    }
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

// Start the server
main();
