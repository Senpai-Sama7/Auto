import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../apps/control-plane/src/app.js";
import {
  BoundedRetryPolicy,
  CapabilityDispatchPolicy,
  ConservativeBudgetPolicy,
  DefaultSkillRegistry,
  WorkerRunService,
  createDefaultWorker
} from "../packages/core/src/index.js";
import { SqlitePlatformStore } from "../packages/sqlite-store/src/index.js";
import { DeterministicRuntimeAdapter } from "../apps/worker/src/runtimeAdapters.js";
import {
  cleanupTempDir,
  createSuccessfulCommandRunner,
  createTempDatabasePath,
  loginAsAdmin,
  testAdmin
} from "./helpers.js";

describe("system lifecycle e2e", () => {
  let dir = "";
  let dbPath = "";
  let baseUrl = "";
  let server: Server | undefined;
  let sessionCookie = "";

  beforeEach(async () => {
    ({ dir, dbPath } = createTempDatabasePath("e2e"));
    const app = await createApp(dbPath, {
      enableQueue: false,
      enablePaperclip: false,
      admin: testAdmin
    });
    server = app.listen(0);
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    sessionCookie = await loginAsAdmin(baseUrl);
  });

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    cleanupTempDir(dir);
  });

  it("boots the control plane, executes a task, and exposes auditable task detail endpoints", async () => {
    const createResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie
      },
      body: JSON.stringify({
        title: "Boot-to-release lifecycle",
        description: "Create a task over HTTP, execute it once, and read back detail endpoints.",
        requestedBy: "vitest-e2e",
        budgetCapUsd: 25,
        idempotencyKey: "e2e-task-1"
      })
    });
    expect(createResponse.status).toBe(201);
    const createdTask = await createResponse.json() as { id: string };

    const store = new SqlitePlatformStore(dbPath);
    await store.registerWorker(createDefaultWorker());
    const runService = new WorkerRunService(
      store,
      new ConservativeBudgetPolicy(),
      new DefaultSkillRegistry(),
      new CapabilityDispatchPolicy(),
      new BoundedRetryPolicy(),
      new DeterministicRuntimeAdapter({
        commandRunner: createSuccessfulCommandRunner()
      })
    );

    const runResult = await runService.runNext("worker-runtime-local");
    const headers = { cookie: sessionCookie };
    const taskResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}`, { headers });
    const gateResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}/gates`, { headers });
    const executionResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}/executions`, { headers });
    const eventResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}/events`, { headers });
    const sessionResponse = await fetch(`${baseUrl}/api/workers/worker-runtime-local/sessions`, { headers });
    const memoryResponse = await fetch(`${baseUrl}/api/workers/worker-runtime-local/memory`, { headers });

    const task = await taskResponse.json() as {
      id: string;
      status: string;
      releaseDecision: { allowed: boolean };
    };
    const gates = await gateResponse.json() as Array<{ gateType: string; status: string }>;
    const executions = await executionResponse.json() as Array<{ status: string; provider: string }>;
    const events = await eventResponse.json() as Array<{ eventType: string }>;
    const sessions = await sessionResponse.json() as Array<{ status: string }>;
    const memory = await memoryResponse.json() as Array<{ category: string }>;

    expect(runResult?.status).toBe("released");
    expect(task.id).toBe(createdTask.id);
    expect(task.status).toBe("released");
    expect(task.releaseDecision.allowed).toBe(true);
    expect(gates.every((gate) => gate.status === "passed")).toBe(true);
    expect(executions[0]?.status).toBe("succeeded");
    expect(executions[0]?.provider).toBe("local-runtime");
    expect(events.some((event) => event.eventType === "task.claimed")).toBe(true);
    expect(events.some((event) => event.eventType === "execution.recorded")).toBe(true);
    expect(sessions[0]?.status).toBe("closed");
    expect(memory.length).toBeGreaterThan(0);
  });
});
