import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import type { Express, Response } from "express";
import type { Queue } from "bullmq";
import {
  ApprovalTransitionInputSchema,
  CreateTaskInputSchema,
  GateTransitionInputSchema,
  LoginInputSchema,
  PasskeyAuthenticationOptionsInputSchema,
  PasskeyRegistrationOptionsInputSchema,
  PasskeyVerificationInputSchema,
  UpsertUserInputSchema,
  type GateType,
  type TaskEvent,
  type TaskIntegrationRefs,
  type TaskRecord,
  type UserRecord
} from "@ultimate-system/contracts";
import {
  CapabilityDispatchPolicy,
  DefaultApprovalPolicy,
  getOpenClawSkills,
  getOpenClawStatus,
  getOpenClawToolCatalog,
  PaperclipClient,
  TaskApprovalService,
  TaskCreationService,
  nowIso
} from "@ultimate-system/core";
import { SqlitePlatformStore } from "@ultimate-system/sqlite-store";
import {
  attachSession,
  clearSessionCookie,
  createAuthSession,
  hashPassword,
  requireApprover,
  requireUser,
  seedLocalIdentities,
  setSessionCookie,
  verifyPassword,
  type AuthenticatedRequest
} from "./auth.js";
import {
  beginPasskeyAuthentication,
  beginPasskeyRegistration,
  finishPasskeyAuthentication,
  finishPasskeyRegistration
} from "./passkeys.js";
import { enqueueTask, createTaskQueue } from "./queue.js";
import {
  adminEmail,
  adminName,
  adminPassword,
  approverEmail,
  approverName,
  approverPassword,
  openclawAgentId as defaultOpenClawAgentId,
  openclawGatewayToken as defaultOpenClawGatewayToken,
  openclawHomeDir as defaultOpenClawHomeDir,
  openclawGatewayUrl as defaultOpenClawGatewayUrl,
  paperclipUrl as defaultPaperclipUrl,
  authOrigins,
  authRpId,
  authRpIds,
  authRpName,
  requesterEmail,
  requesterName,
  requesterPassword,
  redisUrl as defaultRedisUrl,
  viewerEmail,
  viewerName,
  viewerPassword,
  reliantAiAuthUrl
} from "./env.js";

export type CreateAppOptions = {
  redisUrl?: string;
  paperclipUrl?: string;
  enableQueue?: boolean;
  enablePaperclip?: boolean;
  admin?: {
    email: string;
    name: string;
    password: string;
  };
  bootstrapUsers?: Array<{
    email: string;
    name: string;
    password: string;
    role: UserRecord["role"];
  }>;
  openclaw?: {
    status?: () => Promise<Awaited<ReturnType<typeof getOpenClawStatus>>>;
    skills?: () => Promise<Awaited<ReturnType<typeof getOpenClawSkills>>>;
    tools?: () => Promise<Awaited<ReturnType<typeof getOpenClawToolCatalog>>>;
  };
};

function makeEvent(
  eventType: TaskEvent["eventType"],
  actor: string,
  detail: TaskEvent["detail"],
  taskId: string | null = null,
  workerId: string | null = null
): TaskEvent {
  return {
    id: randomUUID(),
    taskId,
    workerId,
    eventType,
    actor,
    detail,
    createdAt: nowIso()
  };
}

function sendAuthError(response: Response, status: 401 | 403, message: string) {
  response.status(status).json({ error: message });
}

function toSafeUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt
  };
}

function requireRequesterRole(request: AuthenticatedRequest, response: Response): UserRecord | null {
  try {
    const user = requireUser(request);
    if (user.role === "viewer") {
      sendAuthError(response, 403, "Viewer role cannot create or mutate tasks.");
      return null;
    }
    return user;
  } catch {
    sendAuthError(response, 401, "Authentication required.");
    return null;
  }
}

function requireApproverRole(request: AuthenticatedRequest, response: Response): UserRecord | null {
  try {
    return requireApprover(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forbidden";
    sendAuthError(response, message === "Unauthorized" ? 401 : 403, `${message}.`);
    return null;
  }
}

function requireAuthenticatedUser(request: AuthenticatedRequest, response: Response): UserRecord | null {
  try {
    return requireUser(request);
  } catch {
    sendAuthError(response, 401, "Authentication required.");
    return null;
  }
}

function requireAdminRole(request: AuthenticatedRequest, response: Response): UserRecord | null {
  try {
    const user = requireUser(request);
    if (user.role !== "admin") {
      sendAuthError(response, 403, "Admin role required.");
      return null;
    }
    return user;
  } catch {
    sendAuthError(response, 401, "Authentication required.");
    return null;
  }
}

async function syncTaskToPaperclip(
  store: SqlitePlatformStore,
  paperclip: PaperclipClient,
  task: TaskRecord,
  baseUrl: string
): Promise<TaskRecord> {
  const org = await store.getOrg(task.orgId);
  if (!org) {
    throw new Error(`Unknown org ${task.orgId}`);
  }

  const teams = await store.listTeams(task.orgId);
  const team = teams.find((candidate) => candidate.id === task.teamId) ?? teams[0] ?? null;
  const company = await paperclip.ensureCompany(org.name, org.mission, org.monthlyBudgetUsd);
  const goal = await paperclip.ensureGoal(
    company.id,
    team?.name ?? "Platform Delivery",
    team?.purpose ?? org.mission
  );
  const issue = await paperclip.createIssue(company.id, goal.id, task);
  const integrationRefs: TaskIntegrationRefs = {
    ...(task.integrationRefs ?? {}),
    paperclip: {
      companyId: company.id,
      goalId: goal.id,
      issueId: issue.id,
      issueIdentifier: issue.identifier ?? null,
      issueUrl: `${baseUrl}/issues/${issue.id}`
    }
  };
  const updatedTask = await store.updateTaskIntegrationRefs(task.id, integrationRefs);
  return updatedTask ?? { ...task, integrationRefs };
}

async function syncPaperclipStatus(paperclip: PaperclipClient | null, task: TaskRecord | null) {
  if (!paperclip || !task?.integrationRefs?.paperclip?.issueId) {
    return;
  }
  await paperclip.updateIssueStatus(task.integrationRefs.paperclip.issueId, task);
}

export async function createApp(databasePath: string, options: CreateAppOptions = {}): Promise<Express> {
  const store = new SqlitePlatformStore(databasePath);
  await store.seedDefaults();
  await seedLocalIdentities(store, options.bootstrapUsers ?? [
    {
      email: options.admin?.email ?? adminEmail,
      name: options.admin?.name ?? adminName,
      password: options.admin?.password ?? adminPassword,
      role: "admin"
    },
    {
      email: requesterEmail,
      name: requesterName,
      password: requesterPassword,
      role: "requester"
    },
    {
      email: approverEmail,
      name: approverName,
      password: approverPassword,
      role: "approver"
    },
    {
      email: viewerEmail,
      name: viewerName,
      password: viewerPassword,
      role: "viewer"
    }
  ]);

  const tasks = new TaskCreationService(store, new DefaultApprovalPolicy());
  const approvals = new TaskApprovalService(store);
  const dispatchPolicy = new CapabilityDispatchPolicy();
  const taskQueues = new Map<string, Queue>();
  const getTaskQueue = (workerId: string) => {
    const existing = taskQueues.get(workerId);
    if (existing) {
      return existing;
    }
    const queue = createTaskQueue(options.redisUrl ?? defaultRedisUrl, workerId);
    taskQueues.set(workerId, queue);
    return queue;
  };
  const enqueueForEligibleWorker = async (task: TaskRecord) => {
    if (options.enableQueue === false) {
      return null;
    }

    const workers = await store.listWorkers();
    const eligibleWorkers = workers
      .filter((worker) => worker.status !== "offline")
      .filter((worker) => dispatchPolicy.canWorkerExecute(task, worker).allowed)
      .sort((left, right) => {
        const leftBusy = left.currentTaskId ? 1 : 0;
        const rightBusy = right.currentTaskId ? 1 : 0;
        return leftBusy - rightBusy || left.spentBudgetUsd - right.spentBudgetUsd;
      });

    const selectedWorker = eligibleWorkers[0] ?? null;
    if (!selectedWorker) {
      return null;
    }

    await enqueueTask(getTaskQueue(selectedWorker.id), task.id, task.maxRetries + 1);
    return selectedWorker;
  };
  const paperclip = options.enablePaperclip === false
    ? null
    : new PaperclipClient(options.paperclipUrl ?? defaultPaperclipUrl);
  const openclaw = {
    status: options.openclaw?.status ?? (() => getOpenClawStatus({
      env: {
        OPENCLAW_HOME: defaultOpenClawHomeDir,
        OPENCLAW_GATEWAY_URL: defaultOpenClawGatewayUrl,
        OPENCLAW_GATEWAY_TOKEN: defaultOpenClawGatewayToken
      }
    })),
    skills: options.openclaw?.skills ?? (() => getOpenClawSkills({
      env: {
        OPENCLAW_HOME: defaultOpenClawHomeDir,
        OPENCLAW_GATEWAY_URL: defaultOpenClawGatewayUrl,
        OPENCLAW_GATEWAY_TOKEN: defaultOpenClawGatewayToken
      }
    })),
    tools: options.openclaw?.tools ?? (() => getOpenClawToolCatalog({
      env: {
        OPENCLAW_HOME: defaultOpenClawHomeDir,
        OPENCLAW_GATEWAY_URL: defaultOpenClawGatewayUrl,
        OPENCLAW_GATEWAY_TOKEN: defaultOpenClawGatewayToken
      }
    }))
  };
  const passkeyConfig = {
    rpName: authRpName,
    rpId: authRpId,
    expectedOrigins: authOrigins,
    expectedRpIds: authRpIds
  };

  const app = express();
  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json());
  app.use(async (request, _response, next) => {
    try {
      await attachSession(store, request as AuthenticatedRequest);
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      timestamp: nowIso()
    });
  });

  app.post("/api/auth/login", async (request, response) => {
    const parsed = LoginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid login payload.",
        issues: parsed.error.flatten()
      });
      return;
    }

    const user = await store.getUserByEmail(parsed.data.email);
    let isAuthenticated = false;

    if (reliantAiAuthUrl) {
      // Attempt SSO with ReliantAI
      try {
        const ssoRes = await fetch(reliantAiAuthUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password })
        });
        if (ssoRes.ok) {
          isAuthenticated = true;
          // If the user doesn't exist locally but SSO succeeded, we might want to create a stub user.
          // For now, we will require the user to be seeded locally in Ultimate System.
        }
      } catch (err) {
        console.error("ReliantAI SSO failed:", err);
      }
    }

    if (!isAuthenticated) {
      if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
        sendAuthError(response, 401, "Invalid email or password.");
        return;
      }
    }

    if (!user) {
       sendAuthError(response, 401, "User authenticated via SSO but not found in local system.");
       return;
    }

    const safeUser = toSafeUser(user);
    const { token } = await createAuthSession(store, safeUser, "password");
    setSessionCookie(response, token);
    response.json({
      authenticated: true,
      authMethod: "password",
      user: safeUser
    });
  });

  app.post("/api/auth/passkeys/login/options", async (request, response) => {
    const parsed = PasskeyAuthenticationOptionsInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid passkey sign-in payload.",
        issues: parsed.error.flatten()
      });
      return;
    }

    try {
      response.json(await beginPasskeyAuthentication(store, passkeyConfig, parsed.data.email));
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : "Could not start passkey sign-in."
      });
    }
  });

  app.post("/api/auth/passkeys/login/verify", async (request, response) => {
    const parsed = PasskeyVerificationInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid passkey verification payload.",
        issues: parsed.error.flatten()
      });
      return;
    }

    try {
      const verified = await finishPasskeyAuthentication(
        store,
        passkeyConfig,
        parsed.data.flowId,
        parsed.data.response as Parameters<typeof finishPasskeyAuthentication>[3]
      );
      const safeUser = toSafeUser(verified.user);
      const { token } = await createAuthSession(store, safeUser, "passkey");
      setSessionCookie(response, token);
      response.json({
        authenticated: true,
        authMethod: "passkey",
        user: safeUser,
        credential: verified.credential
      });
    } catch (error) {
      sendAuthError(response, 401, error instanceof Error ? error.message : "Passkey sign-in failed.");
    }
  });

  app.get("/api/auth/passkeys", async (request, response) => {
    const actor = requireAuthenticatedUser(request as AuthenticatedRequest, response);
    if (!actor) {
      return;
    }
    const credentials = await store.listPasskeyCredentialSummariesByUser(actor.id);
    response.json({
      credentials,
      recommended: credentials.length === 0
    });
  });

  app.post("/api/auth/passkeys/register/options", async (request, response) => {
    const actor = requireAuthenticatedUser(request as AuthenticatedRequest, response);
    if (!actor) {
      return;
    }

    const parsed = PasskeyRegistrationOptionsInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid passkey registration payload.",
        issues: parsed.error.flatten()
      });
      return;
    }

    try {
      response.json(await beginPasskeyRegistration(store, actor, passkeyConfig, parsed.data.label));
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : "Could not start passkey registration."
      });
    }
  });

  app.post("/api/auth/passkeys/register/verify", async (request, response) => {
    const actor = requireAuthenticatedUser(request as AuthenticatedRequest, response);
    if (!actor) {
      return;
    }

    const parsed = PasskeyVerificationInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid passkey verification payload.",
        issues: parsed.error.flatten()
      });
      return;
    }

    try {
      const credential = await finishPasskeyRegistration(
        store,
        actor,
        passkeyConfig,
        parsed.data.flowId,
        parsed.data.response as Parameters<typeof finishPasskeyRegistration>[4]
      );
      response.status(201).json({
        credential
      });
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : "Passkey registration failed."
      });
    }
  });

  app.delete("/api/auth/passkeys/:credentialId", async (request, response) => {
    const actor = requireAuthenticatedUser(request as AuthenticatedRequest, response);
    if (!actor) {
      return;
    }

    const deleted = await store.deletePasskeyCredential(actor.id, request.params.credentialId);
    if (!deleted) {
      response.status(404).json({ error: "Passkey not found." });
      return;
    }

    response.json({ deleted: true });
  });

  app.post("/api/auth/logout", async (request, response) => {
    const authRequest = request as AuthenticatedRequest;
    if (authRequest.currentSessionId) {
      await store.deleteSession(authRequest.currentSessionId);
    }
    clearSessionCookie(response);
    response.json({ authenticated: false });
  });

  app.get("/api/auth/session", (request, response) => {
    const authRequest = request as AuthenticatedRequest;
    response.json({
      authenticated: Boolean(authRequest.currentUser),
      authMethod: authRequest.currentAuthMethod ?? null,
      user: authRequest.currentUser ?? null
    });
  });

  app.use("/api", (request, response, next) => {
    const path = request.path;
    if (path === "/health" || path.startsWith("/auth/")) {
      next();
      return;
    }

    if (!(request as AuthenticatedRequest).currentUser) {
      sendAuthError(response, 401, "Authentication required.");
      return;
    }

    next();
  });

  app.get("/api/state", async (request, response) => {
    const orgId = typeof request.query.orgId === "string" ? request.query.orgId : "org-core";
    response.json(await store.getDashboardState(orgId));
  });

  app.get("/api/openclaw/status", async (_request, response) => {
    try {
      const status = await openclaw.status();
      response.json({
        available: true,
        status,
        agentId: defaultOpenClawAgentId
      });
    } catch (error) {
      response.json({
        available: false,
        agentId: defaultOpenClawAgentId,
        status: {
          gateway: null,
          skillCount: 0,
          toolCount: 0,
          groupCount: 0
        },
        error: error instanceof Error ? error.message : "OpenClaw status unavailable."
      });
    }
  });

  app.get("/api/openclaw/skills", async (_request, response) => {
    try {
      response.json({
        available: true,
        ...await openclaw.skills()
      });
    } catch (error) {
      response.json({
        available: false,
        workspaceDir: defaultOpenClawHomeDir,
        managedSkillsDir: `${defaultOpenClawHomeDir}/skills`,
        skills: [],
        error: error instanceof Error ? error.message : "OpenClaw skills unavailable."
      });
    }
  });

  app.get("/api/openclaw/tools", async (_request, response) => {
    try {
      response.json({
        available: true,
        ...await openclaw.tools()
      });
    } catch (error) {
      response.json({
        available: false,
        sections: [],
        groups: {},
        profiles: [],
        error: error instanceof Error ? error.message : "OpenClaw tool catalog unavailable."
      });
    }
  });

  app.get("/api/tasks", async (_request, response) => {
    response.json(await store.listTasks());
  });

  app.get("/api/tasks/:taskId", async (request, response) => {
    const task = await store.getTask(request.params.taskId);
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }
    response.json(task);
  });

  app.get("/api/tasks/:taskId/detail", async (request, response) => {
    const task = await store.getTask(request.params.taskId);
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }
    response.json({
      task,
      gates: await store.listGates(task.id),
      executions: await store.listExecutions(task.id),
      events: await store.listByTask(task.id)
    });
  });

  app.get("/api/tasks/:taskId/events", async (request, response) => {
    response.json(await store.listByTask(request.params.taskId));
  });

  app.get("/api/tasks/:taskId/executions", async (request, response) => {
    response.json(await store.listExecutions(request.params.taskId));
  });

  app.get("/api/tasks/:taskId/gates", async (request, response) => {
    response.json(await store.listGates(request.params.taskId));
  });

  app.get("/api/workers", async (_request, response) => {
    response.json(await store.listWorkers());
  });

  app.get("/api/workers/:workerId", async (request, response) => {
    const worker = await store.getWorker(request.params.workerId);
    if (!worker) {
      response.status(404).json({ error: "Worker not found." });
      return;
    }
    response.json(worker);
  });

  app.get("/api/workers/:workerId/detail", async (request, response) => {
    const worker = await store.getWorker(request.params.workerId);
    if (!worker) {
      response.status(404).json({ error: "Worker not found." });
      return;
    }
    const limit = Number(request.query.limit ?? 20);
    response.json({
      worker,
      memory: await store.listRecentMemory(worker.id, limit),
      sessions: await store.listSessions(worker.id)
    });
  });

  app.get("/api/workers/:workerId/memory", async (request, response) => {
    const limit = Number(request.query.limit ?? 20);
    const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
    if (query.length > 0) {
      response.json(await store.searchMemory(request.params.workerId, query, limit));
      return;
    }
    response.json(await store.listRecentMemory(request.params.workerId, limit));
  });

  app.get("/api/workers/:workerId/sessions", async (request, response) => {
    response.json(await store.listSessions(request.params.workerId));
  });

  app.get("/api/users", async (request, response) => {
    const actor = requireAdminRole(request as AuthenticatedRequest, response);
    if (!actor) {
      return;
    }

    void actor;
    const users = await store.listUsers();
    const withPasskeyCounts = await Promise.all(
      users.map(async (user) => ({
        ...user,
        passkeyCount: (await store.listPasskeyCredentialSummariesByUser(user.id)).length
      }))
    );
    response.json(withPasskeyCounts);
  });

  app.post("/api/users", async (request, response) => {
    const actor = requireAdminRole(request as AuthenticatedRequest, response);
    if (!actor) {
      return;
    }

    const parsed = UpsertUserInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid user payload.",
        issues: parsed.error.flatten()
      });
      return;
    }

    const timestamp = nowIso();
    await store.upsertUser({
      id: randomUUID(),
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: hashPassword(parsed.data.password),
      role: parsed.data.role,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const created = await store.getUserByEmail(parsed.data.email);
    response.status(201).json(created ? {
      id: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      lastLoginAt: created.lastLoginAt,
      passkeyCount: 0
    } : null);
  });

  app.post("/api/tasks", async (request, response) => {
    const actor = requireRequesterRole(request as AuthenticatedRequest, response);
    if (!actor) {
      return;
    }

    const parsed = CreateTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid task payload.",
        issues: parsed.error.flatten()
      });
      return;
    }

    const existing = parsed.data.idempotencyKey
      ? await store.findTaskByIdempotencyKey(parsed.data.idempotencyKey)
      : null;
    if (existing) {
      response.status(200).json(existing);
      return;
    }

    const task = await tasks.createTask({
      ...parsed.data,
      requestedBy: actor.email
    });

    try {
      const paperclipTask = paperclip
        ? await syncTaskToPaperclip(store, paperclip, task, options.paperclipUrl ?? defaultPaperclipUrl)
        : task;

      if (paperclipTask.approvalState === "approved") {
        await enqueueForEligibleWorker(paperclipTask);
      }

      response.status(201).json(paperclipTask);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Paperclip synchronization failed.";
      const failedTask = await store.recordFailure(task.id, {
        failedAt: nowIso(),
        error: `Paperclip sync failed: ${message}`,
        nextStatus: "failed",
        retryCount: task.retryCount
      });
      await store.publish(
        makeEvent("task.failed", "paperclip-sync", {
          reason: message
        }, task.id)
      );
      response.status(502).json({
        error: "Task creation failed during Paperclip synchronization.",
        detail: message,
        task: failedTask ?? task
      });
    }
  });

  app.post("/api/tasks/:taskId/approval", async (request, response) => {
    const actor = requireApproverRole(request as AuthenticatedRequest, response);
    if (!actor) {
      return;
    }

    const parsed = ApprovalTransitionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid approval transition payload.",
        issues: parsed.error.flatten()
      });
      return;
    }

    const task = await approvals.updateApproval(
      request.params.taskId,
      actor.email,
      parsed.data.approvalState,
      parsed.data.reason
    );
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    if (task.approvalState === "approved") {
      await enqueueForEligibleWorker(task);
    }
    await syncPaperclipStatus(paperclip, task);
    response.json(task);
  });

  app.post("/api/gates/:taskId/:gateType", async (request, response) => {
    const actor = requireApproverRole(request as AuthenticatedRequest, response);
    if (!actor) {
      return;
    }

    const taskId = request.params.taskId;
    const gateType = request.params.gateType as GateType;
    const parsed = GateTransitionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid gate transition payload.",
        issues: parsed.error.flatten()
      });
      return;
    }

    const gates = await store.listGates(taskId);
    const gate = gates.find((item) => item.gateType === gateType);
    if (!gate) {
      response.status(400).json({ error: "Unknown gate or status." });
      return;
    }

    const nextGates = gates.map((item) =>
      item.id === gate.id
        ? {
            ...item,
            status: parsed.data.status,
            evidence: parsed.data.evidence,
            updatedAt: nowIso()
          }
        : item
    );
    const task = await store.getTask(taskId);
    await store.saveGates(taskId, nextGates, task?.releaseDecision ?? null);
    await store.publish(
      makeEvent("gate.updated", actor.email, {
        gateType,
        status: parsed.data.status
      }, taskId)
    );
    const updatedTask = await store.getTask(taskId);
    if (updatedTask?.status === "released") {
      await store.publish(
        makeEvent("task.released", actor.email, {
          gateType: "release"
        }, taskId)
      );
    }
    await syncPaperclipStatus(paperclip, updatedTask);
    response.json(nextGates);
  });

  return app;
}
