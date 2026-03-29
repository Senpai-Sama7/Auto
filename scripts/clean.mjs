import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const targets = [
  "node_modules",
  "data",
  "build-preflight.log",
  "typecheck-preflight.log",
  "lint-preflight.log",
  "apps/control-plane/dist",
  "apps/control-plane/node_modules",
  "apps/control-plane/tsconfig.tsbuildinfo",
  "apps/web/dist",
  "apps/web/node_modules",
  "apps/web/tsconfig.tsbuildinfo",
  "apps/worker/dist",
  "apps/worker/node_modules",
  "apps/worker/tsconfig.tsbuildinfo",
  "packages/contracts/dist",
  "packages/contracts/node_modules",
  "packages/contracts/tsconfig.tsbuildinfo",
  "packages/core/dist",
  "packages/core/node_modules",
  "packages/core/tsconfig.tsbuildinfo",
  "packages/sqlite-store/dist",
  "packages/sqlite-store/node_modules",
  "packages/sqlite-store/tsconfig.tsbuildinfo"
];

for (const relativePath of targets) {
  const fullPath = join(root, relativePath);
  if (existsSync(fullPath)) {
    rmSync(fullPath, { recursive: true, force: true });
    console.log(`removed ${relativePath}`);
  }
}
