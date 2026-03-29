import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandRunner } from "../apps/worker/src/commandRunner.js";

export function createTempDatabasePath(prefix: string): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), `ultimate-system-${prefix}-`));
  return {
    dir,
    dbPath: join(dir, "ultimate-system.db")
  };
}

export function cleanupTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

export function createSuccessfulCommandRunner(): CommandRunner {
  return async (command) => ({
    ...command,
    exitCode: 0,
    stdout: `${command.command} passed`,
    stderr: "",
    durationMs: 10
  });
}

export function createSelectiveCommandRunner(
  failures: Partial<Record<string, string>>
): CommandRunner {
  return async (command) => {
    const error = failures[command.id];
    return {
      ...command,
      exitCode: error ? 1 : 0,
      stdout: error ? "" : `${command.command} passed`,
      stderr: error ?? "",
      durationMs: 10
    };
  };
}

export const testAdmin = {
  email: "admin@test.local",
  password: "test-password-123",
  name: "Test Admin"
};

export async function loginAsUser(
  baseUrl: string,
  credentials: { email: string; password: string }
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(credentials)
  });

  if (!response.ok) {
    throw new Error(`Login failed with ${response.status}: ${await response.text()}`);
  }

  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Login did not return a session cookie.");
  }
  return cookie.split(";")[0] ?? cookie;
}

export async function loginAsAdmin(baseUrl: string, admin = testAdmin): Promise<string> {
  return loginAsUser(baseUrl, admin);
}
