import { exec as execCallback, execFile as execFileCallback, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execCallback);
const execFile = promisify(execFileCallback);

export type VerificationArea = "api" | "runtime" | "data";

export type VerificationCommand = {
  id: string;
  command: string;
  area: VerificationArea;
  expected: string;
  required: boolean;
};

export type VerificationResult = VerificationCommand & {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type CommandRunner = (command: VerificationCommand) => Promise<VerificationResult>;
export type VerificationBackend = "docker" | "shell";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const defaultVerificationCommands: VerificationCommand[] = [
  {
    id: "lint",
    command: "pnpm run lint",
    area: "data",
    expected: "Repository lint gate returns exit 0.",
    required: true
  },
  {
    id: "typecheck",
    command: "pnpm run typecheck",
    area: "runtime",
    expected: "Workspace typecheck returns exit 0.",
    required: true
  },
  {
    id: "build",
    command: "pnpm run build",
    area: "runtime",
    expected: "Workspace build returns exit 0.",
    required: true
  },
  {
    id: "test",
    command: "pnpm run test",
    area: "api",
    expected: "Automated test suite returns exit 0.",
    required: true
  }
];

function normalizeExecFailure(
  command: VerificationCommand,
  startedAt: number,
  error: Error & {
    code?: number | string;
    stdout?: string;
    stderr?: string;
  }
): VerificationResult {
  return {
    ...command,
    exitCode: typeof error.code === "number" ? error.code : 1,
    stdout: error.stdout?.trim() ?? "",
    stderr: error.stderr?.trim() ?? error.message,
    durationMs: Date.now() - startedAt
  };
}

export function createShellCommandRunner(
  cwd = repoRoot,
  timeoutMs = 300_000
): CommandRunner {
  return async (command) => {
    const startedAt = Date.now();
    try {
      const result = await exec(command.command, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024
      });
      return {
        ...command,
        exitCode: 0,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        durationMs: Date.now() - startedAt
      };
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      const errCode = err?.code || err?.exitCode || err?.status || 'unknown';
      const stdOut = err?.stdout ? String(err.stdout) : '';
      const stdErr = err?.stderr ? String(err.stderr) : '';
      const errMsg = error instanceof Error ? error.message : String(error);
      
      const payload = new Error(errMsg) as Error & { code?: number | string; stdout?: string; stderr?: string };
      payload.code = typeof errCode === 'number' ? errCode : 1;
      payload.stdout = stdOut;
      payload.stderr = stdErr;

      return normalizeExecFailure(command, startedAt, payload);
    }
  };
}

function dockerArgs(cwd: string, shellCommand: string, image: string): string[] {
  const args = [
    "run",
    "--rm",
    "-v",
    `${cwd}:/workspace`,
    "-w",
    "/workspace",
    "-e",
    "CI=1",
    "-e",
    "COREPACK_HOME=/tmp/corepack",
    "-e",
    "PNPM_HOME=/tmp/pnpm"
  ];

  if (typeof process.getuid === "function" && typeof process.getgid === "function") {
    args.push("--user", `${process.getuid()}:${process.getgid()}`);
  }

  args.push(
    image,
    "bash",
    "-lc",
    [
      'mkdir -p "$COREPACK_HOME" "$PNPM_HOME"',
      'export PATH="$PNPM_HOME:$PATH"',
      'corepack enable --install-directory "$PNPM_HOME" >/dev/null 2>&1',
      shellCommand
    ].join("; ")
  );

  return args;
}

export function createDockerCommandRunner(
  cwd = repoRoot,
  timeoutMs = 600_000,
  image = process.env.TERMINAL_DOCKER_IMAGE ?? "node:22-bookworm"
): CommandRunner {
  return async (command) => {
    const startedAt = Date.now();
    try {
      const result = await execFile("docker", dockerArgs(cwd, command.command, image), {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024
      });
      return {
        ...command,
        exitCode: 0,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        durationMs: Date.now() - startedAt
      };
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      const errCode = err?.code || err?.exitCode || err?.status || 'unknown';
      const stdOut = err?.stdout ? String(err.stdout) : '';
      const stdErr = err?.stderr ? String(err.stderr) : '';
      const errMsg = error instanceof Error ? error.message : String(error);
      const combinedStderr = `${stdErr}\nEXEC_FILE_ERR_MSG: ${errMsg}\nEXEC_FILE_ERR_CODE: ${errCode}`.trim();
      
      const payload = new Error(errMsg) as Error & { code?: number | string; stdout?: string; stderr?: string };
      payload.code = typeof errCode === 'number' ? errCode : 1;
      payload.stdout = stdOut;
      payload.stderr = combinedStderr;

      return normalizeExecFailure(command, startedAt, payload);
    }
  };
}

function hasDocker(): boolean {
  const result = spawnSync("docker", ["version"], {
    stdio: "ignore"
  });
  return result.status === 0;
}

export function createSandboxedCommandRunner(
  baseRunner: CommandRunner
): CommandRunner {
  return async (command) => {
    const startedAt = Date.now();
    // Basic heuristic to detect potential path traversal inside the command text itself.
    if (command.command.includes("../") || command.command.includes("..\\")) {
      return {
        ...command,
        exitCode: 1,
        stdout: "",
        stderr: `Security error: Path traversal detected in command string: ${command.command}`,
        durationMs: Date.now() - startedAt
      };
    }
    return baseRunner(command);
  };
}

export function createDefaultCommandRunner(options: {
  cwd?: string;
  backend?: VerificationBackend;
  timeoutMs?: number;
  image?: string;
} = {}): CommandRunner {
  const cwd = options.cwd ?? repoRoot;
  const backend = options.backend ?? "docker";

  const normalizedRoot = resolve(repoRoot);
  const normalizedCwd = resolve(cwd);

  if (!normalizedCwd.startsWith(normalizedRoot)) {
    throw new Error(`Security error: requested cwd ${cwd} is outside of allowed repository root ${repoRoot}`);
  }

  let baseRunner: CommandRunner;

  if (backend === "shell") {
    baseRunner = createShellCommandRunner(cwd, options.timeoutMs);
  } else {
    if (!hasDocker()) {
      throw new Error("WORKER_VERIFICATION_BACKEND=docker requires a working docker CLI.");
    }
    baseRunner = createDockerCommandRunner(cwd, options.timeoutMs, options.image);
  }

  return createSandboxedCommandRunner(baseRunner);
}

export async function runVerificationSuite(
  runner: CommandRunner,
  commands: VerificationCommand[]
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  for (const command of commands) {
    const result = await runner(command);
    results.push(result);
    if (command.required && result.exitCode !== 0) {
      break;
    }
  }
  return results;
}
