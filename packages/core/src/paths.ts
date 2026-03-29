import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function findRepoRootFrom(importMetaUrl: string): string {
  let currentDir = dirname(fileURLToPath(importMetaUrl));

  while (true) {
    if (existsSync(resolve(currentDir, "pnpm-workspace.yaml"))
      && existsSync(resolve(currentDir, "package.json"))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Unable to locate repo root from ${importMetaUrl}`);
    }
    currentDir = parentDir;
  }
}
