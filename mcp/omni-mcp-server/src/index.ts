#!/usr/bin/env node
/**
 * Omni MCP Server
 * 
 * The ULTIMATE MCP Server with capabilities AI assistants DON'T have natively:
 * 
 * 🌐 Browser Automation (Puppeteer)
 *    - Navigate JavaScript-heavy websites
 *    - Take screenshots of rendered pages
 *    - Click elements, fill forms
 *    - Execute JavaScript in browser context
 * 
 * 📊 System Monitoring (systeminformation)
 *    - Real-time CPU, memory, disk metrics
 *    - List running processes
 *    - Network interface statistics
 *    - System temperatures
 * 
 * 🖼️ Image Processing (Sharp + Tesseract)
 *    - OCR (text recognition from images)
 *    - Image resize/convert
 *    - Extract image metadata
 * 
 * 🐳 Docker Management (dockerode)
 *    - List/manage containers
 *    - View container logs
 *    - Run new containers
 *    - Build/manage images
 * 
 * 🔌 WebSocket Client (ws)
 *    - Persistent connections
 *    - Real-time bidirectional communication
 *    - Streaming data reception
 * 
 * 🌐 Network Tools
 *    - Port scanning
 *    - Ping hosts
 *    - DNS lookups
 * 
 * 🔔 Notifications (node-notifier)
 *    - Desktop notifications
 *    - System beeps
 * 
 * Environment Variables:
 *   TRANSPORT - 'stdio' (default) or 'http'
 *   PORT - HTTP port when using http transport (default: 3000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

// Import tool registrations
import { registerBrowserTools } from "./tools/browser.js";
import { registerSystemTools } from "./tools/system.js";
import { registerImageTools } from "./tools/image.js";
import { registerDockerTools } from "./tools/docker.js";
import { registerWebSocketTools } from "./tools/websocket.js";
import { registerNetworkTools } from "./tools/network.js";
import { registerNotificationTools } from "./tools/notify.js";

// Server metadata
const SERVER_NAME = "omni-mcp-server";
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
  registerBrowserTools(server);
  registerSystemTools(server);
  registerImageTools(server);
  registerDockerTools(server);
  registerWebSocketTools(server);
  registerNetworkTools(server);
  registerNotificationTools(server);

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
  console.error(`✓ Omni MCP Server running via stdio`);
  console.error(`✓ Server: ${SERVER_NAME} v${SERVER_VERSION}`);
  console.error(`✓ Tools: browser(6), system(5), image(4), docker(6), websocket(4), network(4), notify(2)`);
  console.error(`✓ Total: 31 unique capabilities you DON'T have natively`);
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
      capabilities: [
        "browser-automation",
        "system-monitoring",
        "image-processing",
        "docker-management",
        "websocket-client",
        "network-tools",
        "notifications"
      ],
      timestamp: new Date().toISOString()
    });
  });
  
  // MCP endpoint
  app.post("/mcp", async (req, res) => {
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
    console.error(`✓ Omni MCP Server running on http://localhost:${port}`);
    console.error(`✓ MCP endpoint: POST http://localhost:${port}/mcp`);
    console.error(`✓ Health check: GET http://localhost:${port}/health`);
    console.error(`✓ Server: ${SERVER_NAME} v${SERVER_VERSION}`);
    console.error(`✓ 31 unique capabilities available`);
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
