import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = resolve(rootDir, "infra/upstream-lock.json");
const upstreams = JSON.parse(readFileSync(lockPath, "utf8"));

function run(command, args, cwd = rootDir) {
  execFileSync(command, args, {
    cwd,
    stdio: "inherit"
  });
}

for (const [name, spec] of Object.entries(upstreams)) {
  const dir = resolve(rootDir, spec.dir);
  mkdirSync(dirname(dir), { recursive: true });

  if (!existsSync(dir)) {
    run("git", ["clone", spec.repo, dir]);
  }

  run("git", ["fetch", "--all", "--tags", "--prune"], dir);
  run("git", ["checkout", "--detach", spec.ref], dir);
  console.log(`[bootstrap-upstreams] ${name} -> ${spec.ref}`);
}
