import { describe, it, expect } from "vitest";
import { createDefaultCommandRunner } from "../apps/worker/src/commandRunner.js";

describe("createDefaultCommandRunner sandboxing", () => {
  it("should reject cwd outside of repoRoot", () => {
    expect(() => {
      createDefaultCommandRunner({
        cwd: "/", // Outside repoRoot
        backend: "shell"
      });
    }).toThrow(/Security error: requested cwd \/ is outside of allowed repository root/);
  });

  it("should reject commands with path traversal", async () => {
    const runner = createDefaultCommandRunner({
      backend: "shell"
    });

    const result = await runner({
      id: "test",
      command: "cd ../ && ls",
      area: "data",
      expected: "Should fail",
      required: true
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Security error: Path traversal detected in command string");
  });
});
