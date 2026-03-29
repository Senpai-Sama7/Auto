import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node"
  },
  resolve: {
    alias: {
      "@ultimate-system/contracts": resolve(rootDir, "packages/contracts/src/index.ts"),
      "@ultimate-system/core": resolve(rootDir, "packages/core/src/index.ts"),
      "@ultimate-system/sqlite-store": resolve(rootDir, "packages/sqlite-store/src/index.ts")
    }
  }
});
