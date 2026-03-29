import { describe, expect, it } from "vitest";
import { WorkerExecutionInputSchema, WorkerExecutionResultSchema } from "../packages/contracts/src/index.js";
import { createDefaultWorker } from "../packages/core/src/index.js";
import { DeterministicRuntimeAdapter } from "../apps/worker/src/runtimeAdapters.js";
import { createSuccessfulCommandRunner } from "./helpers.js";

describe("DeterministicRuntimeAdapter", () => {
  it("returns a valid worker execution result with auditable runtime evidence", async () => {
    const adapter = new DeterministicRuntimeAdapter({
      commandRunner: createSuccessfulCommandRunner()
    });
    const worker = createDefaultWorker();
    const input = WorkerExecutionInputSchema.parse({
      task: {
        id: "task-1",
        orgId: "org-core",
        teamId: "team-platform",
        title: "Implement a governed worker slice",
        description: "Use persistent memory, spec-first notes, and release evidence.",
        requestedBy: "vitest",
        skillHint: "tdd",
        requiredCapabilities: ["planning"],
        executionMode: "deterministic",
        status: "running",
        approvalState: "approved",
        approvalReason: "Auto-approved by test policy.",
        approvedBy: "vitest",
        approvedAt: new Date().toISOString(),
        route: "control-plane -> worker-adapter",
        assignedWorkerId: worker.id,
        budgetCapUsd: 20,
        budgetEstimateUsd: 2,
        budgetActualUsd: 0,
        idempotencyKey: null,
        retryCount: 0,
        maxRetries: 1,
        lastError: null,
        resultSummary: null,
        artifacts: null,
        integrationRefs: null,
        releaseDecision: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      worker,
      recall: [
        {
          id: "memory-1",
          workerId: worker.id,
          taskId: null,
          category: "learning",
          content: "Explicit contracts reduced ambiguity on the previous run.",
          createdAt: new Date().toISOString()
        }
      ],
      skills: [
        {
          id: "spec-first",
          name: "Spec First",
          phase: "spec",
          summary: "Capture the desired outcome."
        },
        {
          id: "review-loop",
          name: "Review Loop",
          phase: "review",
          summary: "Require review evidence before release."
        }
      ]
    });

    const result = WorkerExecutionResultSchema.parse(await adapter.execute(input));

    expect(result.summary).toContain("Implement a governed worker slice");
    expect(result.artifacts.specDoc).toContain("Runtime Specification");
    expect(result.artifacts.planDoc).toContain("Execution Plan");
    expect(result.artifacts.reviewFindings[0]?.title).toContain("Verification suite passed");
    expect(result.artifacts.securityControls.length).toBeGreaterThan(0);
    expect(result.execution.status).toBe("succeeded");
    expect(result.execution.toolCalls.length).toBeGreaterThan(0);
    expect(result.memoryAdditions.length).toBeGreaterThanOrEqual(2);
    expect(result.actualCostUsd).toBe(0);
  });
});
