import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env.js";

loadLocalEnv();

const run = promisify(execFile);
const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(rootDir, process.env.RELEASE_DECISION_PATH ?? "./data/release-decision.json");

type StepResult = {
  name: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  ok: boolean;
};

async function runStep(name: string, command: string, args: string[] = []): Promise<StepResult> {
  try {
    const { stdout, stderr } = await run(command, args, {
      cwd: rootDir,
      maxBuffer: 16 * 1024 * 1024,
      env: process.env
    });
    return {
      name,
      command: [command, ...args].join(" "),
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      ok: true
    };
  } catch (error) {
    const err = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      name,
      command: [command, ...args].join(" "),
      exitCode: err.code ?? 1,
      stdout: err.stdout?.trim() ?? "",
      stderr: err.stderr?.trim() ?? err.message,
      ok: false
    };
  }
}

const steps: StepResult[] = [];

for (const [name, command, args] of [
  ["redis", "bash", ["./scripts/start-redis.sh"]],
  ["paperclip", "bash", ["./scripts/start-paperclip.sh"]],
  ["hermes", "bash", ["./scripts/start-hermes.sh"]],
  ["control-plane", "bash", ["./scripts/start-control-plane.sh"]],
  ["worker", "bash", ["./scripts/start-worker.sh"]],
  ["web", "bash", ["./scripts/start-web.sh"]],
  ["lint", "pnpm", ["lint"]],
  ["typecheck", "pnpm", ["typecheck"]],
  ["build", "pnpm", ["build"]],
  ["test", "pnpm", ["test"]],
  ["canary", "pnpm", ["canary"]],
  ["benchmark", "pnpm", ["benchmark"]]
] as const) {
  const result = await runStep(name, command, args);
  steps.push(result);
  if (!result.ok) {
    break;
  }
}

const blockingSteps = steps.filter((step) => !step.ok).map((step) => `${step.name}: ${step.command}`);
const decision = {
  generatedAt: new Date().toISOString(),
  allowed: blockingSteps.length === 0,
  reasons: steps.filter((step) => step.ok).map((step) => `${step.name} passed`),
  blockingReasons: blockingSteps,
  steps
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
console.log(JSON.stringify(decision, null, 2));

if (!decision.allowed) {
  process.exit(1);
}
