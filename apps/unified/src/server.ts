import type { Request, Response} from "express";
import express from "express";
import type { Options } from "http-proxy-middleware";
import { createProxyMiddleware } from "http-proxy-middleware";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Root directory is 3 levels up from apps/unified/src
// apps/unified/src/server.ts -> apps/unified -> apps -> root (Auto)
const rootDir = join(__dirname, "../../..");

// Configuration
const config = {
  unifiedPort: parseInt(process.env.UNIFIED_PORT || "8888", 10),
  controlPlaneUrl: process.env.CONTROL_PLANE_URL || "http://localhost:4100",
  webBuildDir: process.env.WEB_BUILD_DIR || join(rootDir, "apps/web/dist"),
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6380",
  paperclipUrl: process.env.PAPERCLIP_URL || "http://127.0.0.1:3100",
  hermesUrl: process.env.HERMES_API_URL || "http://127.0.0.1:8642",
  openclawUrl: process.env.OPENCLAW_GATEWAY_URL || "ws://127.0.0.1:28789"
};

const app = express();
const server = createServer(app);

// Middleware
app.use(compression());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "ultimate-system-unified",
    timestamp: new Date().toISOString(),
    ports: {
      unified: config.unifiedPort,
      controlPlane: config.controlPlaneUrl,
      webBuildDir: config.webBuildDir
    }
  });
});

// API proxy - route /api/* to control plane
const proxyOptions: Options = {
  target: config.controlPlaneUrl,
  changeOrigin: true,
  // Add /api back since Express strips it when using app.use("/api", ...)
  pathRewrite: (path) => {
    const newPath = `/api${path}`;
    console.log(`Proxying: ${path} -> ${config.controlPlaneUrl}${newPath}`);
    return newPath;
  },
  on: {
    proxyReq: (proxyReq, req) => {
      // Preserve cookies and auth headers
      const expressReq = req as Request;
      if (expressReq.headers.cookie) {
        proxyReq.setHeader("Cookie", expressReq.headers.cookie);
      }
      console.log(`Proxying request to: ${proxyReq.path}`);
    },
    proxyRes: (_proxyRes, _req, res) => {
      // Ensure CORS headers
      const expressRes = res as Response;
      expressRes.setHeader("Access-Control-Allow-Credentials", "true");
    },
    error: (err, _req, res) => {
      console.error("Proxy error:", err);
      const expressRes = res as Response;
      expressRes.status(500).json({ error: "Proxy error", message: err.message });
    }
  }
};

app.use("/api", createProxyMiddleware(proxyOptions));

// Static files - serve the web dashboard
const webBuildDir = config.webBuildDir;
if (existsSync(webBuildDir)) {
  console.log(`Serving web dashboard from: ${webBuildDir}`);
  
  // Serve static files with caching
  app.use(express.static(webBuildDir, {
    maxAge: "1d",
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-cache");
    }
  }));
  
  // SPA fallback - serve index.html for all non-file routes
  app.get("*", (req: Request, res: Response) => {
    const indexPath = join(webBuildDir, "index.html");
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Web dashboard not built");
    }
  });
} else {
  console.warn(`Web build directory not found: ${webBuildDir}`);
  app.get("/", (_req: Request, res: Response) => {
    res.status(503).send(`
      <html>
        <head><title>Ultimate System</title></head>
        <body style="font-family: system-ui; padding: 2rem; max-width: 600px; margin: 0 auto;">
          <h1>Ultimate System</h1>
          <p>Web dashboard not built. Run:</p>
          <pre>pnpm --filter @ultimate-system/web build</pre>
          <p>Or use the control plane API directly:</p>
          <pre>curl http://localhost:${config.unifiedPort}/api/health</pre>
        </body>
      </html>
    `);
  });
}

// Start server
server.listen(config.unifiedPort, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 ULTIMATE SYSTEM - Unified Access Point                  ║
║                                                              ║
║   Dashboard:  http://localhost:${config.unifiedPort}                       ║
║   API:        http://localhost:${config.unifiedPort}/api                   ║
║   Health:     http://localhost:${config.unifiedPort}/health                ║
║                                                              ║
║   Control Plane: ${config.controlPlaneUrl}                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

All services accessible through a single port!
Dashboard and API are served from the same origin.
`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\nSIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});