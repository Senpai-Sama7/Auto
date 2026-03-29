import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../apps/control-plane/src/app.js";
import {
  BoundedRetryPolicy,
  CapabilityDispatchPolicy,
  ConservativeBudgetPolicy,
  DefaultSkillRegistry,
  WorkerRunService,
  createDefaultWorker,
  nowIso
} from "../packages/core/src/index.js";
import { SqlitePlatformStore } from "../packages/sqlite-store/src/index.js";
import { DeterministicRuntimeAdapter } from "../apps/worker/src/runtimeAdapters.js";
import {
  cleanupTempDir,
  createSuccessfulCommandRunner,
  createTempDatabasePath,
  loginAsUser,
  loginAsAdmin,
  testAdmin
} from "./helpers.js";

describe("control-plane API", () => {
  let dir = "";
  let dbPath = "";
  let server: Server | undefined;
  let baseUrl = "";
  let sessionCookie = "";

  beforeEach(async () => {
    ({ dir, dbPath } = createTempDatabasePath("api"));
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
        server!.close((error) => {
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

  it("creates tasks through HTTP and exposes worker memory and sessions", async () => {
    const createResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie
      },
      body: JSON.stringify({
        title: "Exercise the HTTP control plane",
        description: "Create a task through the API and verify persisted worker evidence.",
        requestedBy: "vitest-api",
        budgetCapUsd: 25
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

    const finishedTask = await runService.runNext("worker-runtime-local");
    const stateResponse = await fetch(`${baseUrl}/api/state`, {
      headers: { cookie: sessionCookie }
    });
    const state = await stateResponse.json() as {
      tasks: Array<{ id: string; status: string }>;
      recentEvents: Array<{ eventType: string }>;
    };
    const memoryResponse = await fetch(`${baseUrl}/api/workers/worker-runtime-local/memory`, {
      headers: { cookie: sessionCookie }
    });
    const memory = await memoryResponse.json() as Array<{ category: string; content: string }>;
    const filteredMemoryResponse = await fetch(
      `${baseUrl}/api/workers/worker-runtime-local/memory?q=Operational%20evidence`,
      {
        headers: { cookie: sessionCookie }
      }
    );
    const filteredMemory = await filteredMemoryResponse.json() as Array<{ content: string }>;
    const executionResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}/executions`, {
      headers: { cookie: sessionCookie }
    });
    const executions = await executionResponse.json() as Array<{ status: string }>;
    const sessionResponse = await fetch(`${baseUrl}/api/workers/worker-runtime-local/sessions`, {
      headers: { cookie: sessionCookie }
    });
    const sessions = await sessionResponse.json() as Array<{ status: string }>;

    expect(finishedTask?.id).toBe(createdTask.id);
    expect(finishedTask?.status).toBe("released");
    expect(state.tasks.find((task) => task.id === createdTask.id)?.status).toBe("released");
    expect(state.recentEvents.some((event) => event.eventType === "task.released")).toBe(true);
    expect(executions[0]?.status).toBe("succeeded");
    expect(memory.length).toBeGreaterThanOrEqual(2);
    expect(filteredMemory.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0]?.status).toBe("closed");
  });

  it("enforces RBAC for viewers, requesters, approvers, and admins", async () => {
    const requesterCookie = await loginAsUser(baseUrl, {
      email: "requester@ultimate-system.local",
      password: "requester-password"
    });
    const approverCookie = await loginAsUser(baseUrl, {
      email: "approver@ultimate-system.local",
      password: "approver-password"
    });
    const viewerCookie = await loginAsUser(baseUrl, {
      email: "viewer@ultimate-system.local",
      password: "viewer-password"
    });

    const viewerCreate = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: viewerCookie
      },
      body: JSON.stringify({
        title: "Viewer blocked",
        description: "The viewer role must not be able to create a task.",
        requestedBy: "viewer@test.local",
        budgetCapUsd: 10
      })
    });
    expect(viewerCreate.status).toBe(403);

    const requesterCreate = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: requesterCookie
      },
      body: JSON.stringify({
        title: "Requester allowed",
        description: "The requester role can create tasks but cannot approve them.",
        requestedBy: "requester@test.local",
        executionMode: "provider",
        budgetCapUsd: 10
      })
    });
    expect(requesterCreate.status).toBe(201);
    const createdTask = await requesterCreate.json() as { id: string };

    const requesterApproval = await fetch(`${baseUrl}/api/tasks/${createdTask.id}/approval`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: requesterCookie
      },
      body: JSON.stringify({
        approvalState: "approved",
        reason: "Requester should not approve."
      })
    });
    expect(requesterApproval.status).toBe(403);

    const approverApproval = await fetch(`${baseUrl}/api/tasks/${createdTask.id}/approval`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: approverCookie
      },
      body: JSON.stringify({
        approvalState: "approved",
        reason: "Approved by approver role."
      })
    });
    expect(approverApproval.status).toBe(200);

    const viewerUsers = await fetch(`${baseUrl}/api/users`, {
      headers: {
        cookie: viewerCookie
      }
    });
    expect(viewerUsers.status).toBe(403);

    const adminUsers = await fetch(`${baseUrl}/api/users`, {
      headers: {
        cookie: sessionCookie
      }
    });
    expect(adminUsers.status).toBe(200);
    const listedUsers = await adminUsers.json() as Array<{ email: string; role: string }>;
    expect(listedUsers.some((user) => user.role === "viewer")).toBe(true);
    expect(listedUsers.some((user) => user.role === "approver")).toBe(true);

    const createUser = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie
      },
      body: JSON.stringify({
        email: "new-approver@test.local",
        name: "New Approver",
        password: "new-approver-password",
        role: "approver"
      })
    });
    expect(createUser.status).toBe(201);
  });

  it("reports auth method and exposes passkey inventory and options", async () => {
    const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { cookie: sessionCookie }
    });
    expect(sessionResponse.status).toBe(200);
    const currentSession = await sessionResponse.json() as { authMethod: string | null };
    expect(currentSession.authMethod).toBe("password");

    const store = new SqlitePlatformStore(dbPath);
    const admin = await store.getUserByEmail(testAdmin.email);
    expect(admin).not.toBeNull();
    const timestamp = nowIso();
    await store.savePasskeyCredential({
      id: "cred-admin-primary",
      userId: admin!.id,
      webauthnUserId: "wa-admin-primary",
      publicKey: Buffer.from("public-key-material").toString("base64url"),
      counter: 4,
      deviceType: "multiDevice",
      backedUp: true,
      transports: ["internal"],
      label: "Executive MacBook",
      createdAt: timestamp,
      lastUsedAt: timestamp
    });

    const passkeyList = await fetch(`${baseUrl}/api/auth/passkeys`, {
      headers: { cookie: sessionCookie }
    });
    expect(passkeyList.status).toBe(200);
    const passkeyPayload = await passkeyList.json() as {
      recommended: boolean;
      credentials: Array<{ id: string; label: string | null; deviceType: string }>;
    };
    expect(passkeyPayload.recommended).toBe(false);
    expect(passkeyPayload.credentials[0]?.label).toBe("Executive MacBook");

    const usersResponse = await fetch(`${baseUrl}/api/users`, {
      headers: { cookie: sessionCookie }
    });
    expect(usersResponse.status).toBe(200);
    const users = await usersResponse.json() as Array<{ email: string; passkeyCount: number }>;
    expect(users.find((user) => user.email === testAdmin.email)?.passkeyCount).toBe(1);

    const registrationOptions = await fetch(`${baseUrl}/api/auth/passkeys/register/options`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie
      },
      body: JSON.stringify({
        label: "Desk biometrics"
      })
    });
    expect(registrationOptions.status).toBe(200);
    const registrationPayload = await registrationOptions.json() as {
      flowId: string;
      options: {
        challenge: string;
        user: { name: string };
      };
    };
    expect(registrationPayload.flowId.length).toBeGreaterThan(10);
    expect(registrationPayload.options.challenge.length).toBeGreaterThan(10);
    expect(registrationPayload.options.user.name).toBe(testAdmin.email);

    const loginOptions = await fetch(`${baseUrl}/api/auth/passkeys/login/options`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: testAdmin.email
      })
    });
    expect(loginOptions.status).toBe(200);
    const loginPayload = await loginOptions.json() as {
      flowId: string;
      options: {
        challenge: string;
        allowCredentials: Array<{ id: string }>;
      };
    };
    expect(loginPayload.flowId.length).toBeGreaterThan(10);
    expect(loginPayload.options.allowCredentials[0]?.id).toBe("cred-admin-primary");

    const deletedPasskey = await fetch(`${baseUrl}/api/auth/passkeys/cred-admin-primary`, {
      method: "DELETE",
      headers: { cookie: sessionCookie }
    });
    expect(deletedPasskey.status).toBe(200);
  });

  it("exposes authenticated OpenClaw insight endpoints", async () => {
    const openclawDir = createTempDatabasePath("openclaw-api");
    const app = await createApp(openclawDir.dbPath, {
      enableQueue: false,
      enablePaperclip: false,
      admin: testAdmin,
      openclaw: {
        status: async () => ({
          gateway: { ok: true, version: "test-gateway" },
          skillCount: 3,
          toolCount: 9,
          groupCount: 2
        }),
        skills: async () => ({
          workspaceDir: "/tmp/openclaw-workspace",
          managedSkillsDir: "/tmp/openclaw-workspace/.openclaw/skills",
          skills: [
            {
              name: "repo-search",
              description: "Search repository content.",
              eligible: true,
              disabled: false,
              blockedByAllowlist: false,
              source: "managed"
            }
          ]
        }),
        tools: async () => ({
          sections: [
            {
              id: "core",
              label: "Core",
              tools: [
                {
                  id: "read_file",
                  label: "Read File",
                  description: "Read a file from the workspace.",
                  profiles: ["filesystem"]
                }
              ]
            }
          ],
          groups: {
            filesystem: ["read_file"]
          },
          profiles: [
            {
              id: "filesystem",
              label: "Filesystem"
            }
          ]
        })
      }
    });
    const localServer = app.listen(0);
    await once(localServer, "listening");
    const address = localServer.address() as AddressInfo;
    const localBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const unauthorized = await fetch(`${localBaseUrl}/api/openclaw/status`);
      expect(unauthorized.status).toBe(401);

      const cookie = await loginAsAdmin(localBaseUrl);
      const [statusResponse, skillsResponse, toolsResponse] = await Promise.all([
        fetch(`${localBaseUrl}/api/openclaw/status`, {
          headers: { cookie }
        }),
        fetch(`${localBaseUrl}/api/openclaw/skills`, {
          headers: { cookie }
        }),
        fetch(`${localBaseUrl}/api/openclaw/tools`, {
          headers: { cookie }
        })
      ]);

      expect(statusResponse.status).toBe(200);
      expect(skillsResponse.status).toBe(200);
      expect(toolsResponse.status).toBe(200);

      const status = await statusResponse.json() as {
        available: boolean;
        agentId: string;
        status: {
          skillCount: number;
          toolCount: number;
        };
      };
      const skills = await skillsResponse.json() as {
        available: boolean;
        skills: Array<{ name: string; eligible: boolean }>;
      };
      const tools = await toolsResponse.json() as {
        available: boolean;
        sections: Array<{ id: string; tools: Array<{ id: string }> }>;
      };

      expect(status.available).toBe(true);
      expect(skills.available).toBe(true);
      expect(tools.available).toBe(true);
      expect(status.status.skillCount).toBe(3);
      expect(status.status.toolCount).toBe(9);
      expect(skills.skills[0]).toMatchObject({
        name: "repo-search",
        eligible: true
      });
      expect(tools.sections[0]).toMatchObject({
        id: "core"
      });
      expect(tools.sections[0]?.tools[0]?.id).toBe("read_file");
    } finally {
      await new Promise<void>((resolve, reject) => {
        localServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      cleanupTempDir(openclawDir.dir);
    }
  });

  it("returns graceful OpenClaw unavailability payloads", async () => {
    const unavailableDir = createTempDatabasePath("openclaw-unavailable");
    const localApp = await createApp(unavailableDir.dbPath, {
      enableQueue: false,
      enablePaperclip: false,
      admin: testAdmin,
      openclaw: {
        status: async () => {
          throw new Error("gateway offline");
        },
        skills: async () => {
          throw new Error("skills offline");
        },
        tools: async () => {
          throw new Error("tools offline");
        }
      }
    });
    const localServer = localApp.listen(0);
    await once(localServer, "listening");
    const address = localServer.address() as AddressInfo;
    const localBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const cookie = await loginAsAdmin(localBaseUrl);
      const [statusResponse, skillsResponse, toolsResponse] = await Promise.all([
        fetch(`${localBaseUrl}/api/openclaw/status`, {
          headers: { cookie }
        }),
        fetch(`${localBaseUrl}/api/openclaw/skills`, {
          headers: { cookie }
        }),
        fetch(`${localBaseUrl}/api/openclaw/tools`, {
          headers: { cookie }
        })
      ]);

      expect(statusResponse.status).toBe(200);
      expect(skillsResponse.status).toBe(200);
      expect(toolsResponse.status).toBe(200);

      const status = await statusResponse.json() as {
        available: boolean;
        error: string;
        status: {
          skillCount: number;
        };
      };
      const skills = await skillsResponse.json() as {
        available: boolean;
        error: string;
        skills: unknown[];
      };
      const tools = await toolsResponse.json() as {
        available: boolean;
        error: string;
        sections: unknown[];
      };

      expect(status.available).toBe(false);
      expect(status.error).toContain("gateway offline");
      expect(status.status.skillCount).toBe(0);
      expect(skills.available).toBe(false);
      expect(skills.error).toContain("skills offline");
      expect(skills.skills).toHaveLength(0);
      expect(tools.available).toBe(false);
      expect(tools.error).toContain("tools offline");
      expect(tools.sections).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        localServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      cleanupTempDir(unavailableDir.dir);
    }
  });
});
