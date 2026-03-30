import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import type { Express, Response } from "express";
import rateLimit from "express-rate-limit";
import type { Queue } from "bullmq";
import { z } from "zod";
import {
  ApprovalTransitionInputSchema,
  CreateTaskInputSchema,
  GateTransitionInputSchema,
  LoginInputSchema,
  PasskeyAuthenticationOptionsInputSchema,
  PasskeyRegistrationOptionsInputSchema,
  PasskeyVerificationInputSchema,
  UpsertUserInputSchema,
  type TaskIntegrationRefs,
  type TaskRecord,
  type UserRecord,
  type TaskEvent
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
  reliantAiAuthUrl,
  openRouterApiKey
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

  const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window`
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many chat requests, please try again later." }
  });

  const app = express();
  app.use(cors({
    origin: authOrigins.length > 0 ? authOrigins : true,
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

    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid credentialId", issues: idParsed.error.flatten() });
    }

    const deleted = await store.deletePasskeyCredential(actor.id, idParsed.data.credentialId!);
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

  const ChatInputSchema = z.object({
    message: z.string().min(1).max(2000),
    context: z.record(z.string(), z.unknown()).optional(),
    model: z.string().default("openrouter/auto")
  });

  const IdParamSchema = z.object({
    taskId: z.string().min(1).max(100).optional(),
    workerId: z.string().min(1).max(100).optional(),
    credentialId: z.string().min(1).max(100).optional()
  });

  const StateQuerySchema = z.object({
    orgId: z.string().min(1).max(100).default("org-core")
  });

  const MemoryQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().max(500).default("")
  });

  app.get("/api/state", async (request, response) => {
    const parsed = StateQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return response.status(400).json({ error: "Invalid query parameters", issues: parsed.error.flatten() });
    }
    response.json(await store.getDashboardState(parsed.data.orgId));
  });

  app.post("/api/chat", chatLimiter, async (request, response) => {
    try {
      const parsed = ChatInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return response.status(400).json({ error: "Invalid chat payload", issues: parsed.error.flatten() });
      }
      const { message, context, model } = parsed.data;
      const authRequest = request as AuthenticatedRequest;
      const userRole = authRequest.currentUser?.role ?? "viewer";
      const userEmail = authRequest.currentUser?.email ?? "system";

      if (!openRouterApiKey) {
        return response.json({ reply: "I cannot assist you until OPENROUTER_API_KEY is configured in the environment." });
      }

      const tools = [
        {
          type: "function",
          function: {
            name: "create_task",
            description: "Create a new task in the system.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                budgetCapUsd: { type: "number", description: "Budget limit in USD" },
                executionMode: { type: "string", enum: ["deterministic", "autonomous"] }
              },
              required: ["title", "description"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "approve_task",
            description: "Approve a pending task. Requires approver or admin role.",
            parameters: {
              type: "object",
              properties: {
                taskId: { type: "string" }
              },
              required: ["taskId"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "fail_task",
            description: "Mark a task as failed. Requires approver or admin role.",
            parameters: {
              type: "object",
              properties: {
                taskId: { type: "string" }
              },
              required: ["taskId"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "get_task_status",
            description: "Get the status of a specific task.",
            parameters: {
              type: "object",
              properties: {
                taskId: { type: "string" }
              },
              required: ["taskId"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "list_tasks",
            description: "List tasks with optional state filter. Returns top 5.",
            parameters: {
              type: "object",
              properties: {
                state: { type: "string", enum: ["all", "pending", "running", "failed", "completed"], description: "State to filter by" }
              }
            }
          }
        },
        {
          type: "function",
          function: {
            name: "list_workers",
            description: "List workers with optional status filter. Returns top 5.",
            parameters: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["all", "offline", "active"], description: "Status to filter by" }
              }
            }
          }
        },
        {
          type: "function",
          function: {
            name: "recent_events",
            description: "Get recent system events.",
            parameters: {
              type: "object",
              properties: {
                limit: { type: "number", default: 5 }
              }
            }
          }
        }
      ];

      const systemPrompt = `You are the natural language system controller for the Ultimate System. 
The user has role: ${userRole}. 
Current context: ${JSON.stringify(context || {})}.
If the user wants to execute a system action, use the appropriate tool. If the user refers to "this task", use the selectedTaskId from context.`;

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openRouterApiKey}`,
          "HTTP-Referer": "http://localhost:4173",
          "X-Title": "Ultimate System Chat"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          tools,
          tool_choice: "auto"
        })
      });

      if (!res.ok) {
        throw new Error(`OpenRouter API error: ${await res.text()}`);
      }

      const aiData = await res.json();
      const responseMessage = aiData.choices?.[0]?.message;

      if (!responseMessage) {
        return response.json({ reply: "Received empty response from AI." });
      }

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        const toolCall = responseMessage.tool_calls[0];
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }
        let toolResult = "";

        try {
          switch (toolCall.function.name) {
            case "create_task": {
              const task = await tasks.createTask({
                title: args.title || "New Task",
                description: args.description || "No description provided",
                requestedBy: userEmail,
                orgId: "org-core",
                teamId: "team-core",
                executionMode: args.executionMode || "deterministic",
                requiredCapabilities: [],
                budgetCapUsd: args.budgetCapUsd || 1.0,
                maxRetries: 1
              });
              toolResult = `Created task "${task.title}" (ID: ${task.id}) with budget $${task.budgetCapUsd} and mode ${task.executionMode}.`;
              break;
            }
            case "approve_task": {
              if (userRole !== "approver" && userRole !== "admin") {
                throw new Error("You do not have permission to approve tasks.");
              }
              if (!args.taskId) {
                throw new Error("taskId is required.");
              }
              const result = await approvals.updateApproval(args.taskId, userEmail, "approved", "Approved via chat command.");
              if (!result) throw new Error(`Failed to find or approve task ${args.taskId}.`);
              toolResult = `Task ${args.taskId} approved.`;
              break;
            }
            case "fail_task": {
              if (userRole !== "approver" && userRole !== "admin") {
                throw new Error("You do not have permission to fail tasks.");
              }
              if (!args.taskId) {
                throw new Error("taskId is required.");
              }
              const result = await store.recordFailure(args.taskId, {
                failedAt: nowIso(),
                error: "Failed via chat command.",
                nextStatus: "failed",
                retryCount: 0
              });
              if (!result) throw new Error(`Failed to find or update task ${args.taskId}.`);
              toolResult = `Task ${args.taskId} marked as failed.`;
              break;
            }
            case "get_task_status": {
              if (!args.taskId) {
                throw new Error("taskId is required.");
              }
              const task = await store.getTask(args.taskId);
              if (!task) throw new Error(`Task ${args.taskId} not found.`);
              toolResult = `Task ${args.taskId} status: ${task.status}.`;
              break;
            }
            case "list_tasks": {
              const type = args.state || "all";
              const state = await store.getDashboardState("org-core");
              let filteredTasks = state.tasks;
              if (type === "pending") filteredTasks = filteredTasks.filter(t => t.approvalState === "pending");
              else if (type === "running") filteredTasks = filteredTasks.filter(t => t.status === "running");
              else if (type === "failed") filteredTasks = filteredTasks.filter(t => t.status === "failed");
              else if (type === "completed") filteredTasks = filteredTasks.filter(t => t.status === "completed");
              
              const total = filteredTasks.length;
              const top5 = filteredTasks.slice(0, 5);
              toolResult = `Found ${total} ${type} tasks. ` + (total > 0 ? `Here are the most recent up to 5:\n` + top5.map(t => `- ${t.id} (${t.status}, ${t.title})`).join("\n") : "");
              break;
            }
            case "list_workers": {
              const type = args.status || "all";
              const state = await store.getDashboardState("org-core");
              let filteredWorkers = state.workers;
              if (type === "offline") filteredWorkers = filteredWorkers.filter(w => w.status === "offline");
              else if (type === "active") filteredWorkers = filteredWorkers.filter(w => w.status !== "offline");
              
              const total = filteredWorkers.length;
              const top5 = filteredWorkers.slice(0, 5);
              toolResult = `Found ${total} ${type} workers. ` + (total > 0 ? `Here are up to 5:\n` + top5.map(w => `- ${w.id} (${w.status})`).join("\n") : "");
              break;
            }
            case "recent_events": {
              const limit = Math.min(args.limit || 5, 10);
              const events = await store.listRecent(limit);
              toolResult = events.length > 0 ? `Here are the ${events.length} most recent events:\n` + events.map(e => `- ${e.eventType} by ${e.actor} (Task: ${e.taskId || 'None'})`).join("\n") : "No recent events found.";
              break;
            }
            default:
              throw new Error(`Unknown tool: ${toolCall.function.name}`);
          }
        } catch (err) {
          toolResult = `Error executing ${toolCall.function.name}: ${err instanceof Error ? err.message : String(err)}`;
        }

        return response.json({ reply: toolResult });
      }

      response.json({ reply: responseMessage.content || "I understood your message, but no action was required." });
    } catch (error) {
      console.error("Chat error:", error);
      response.status(500).json({ error: "Failed to process chat message.", reply: "I encountered an error trying to process that command." });
    }
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
    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid taskId", issues: idParsed.error.flatten() });
    }
    const task = await store.getTask(idParsed.data.taskId!);
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }
    response.json(task);
  });

  app.get("/api/tasks/:taskId/detail", async (request, response) => {
    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid taskId", issues: idParsed.error.flatten() });
    }
    const task = await store.getTask(idParsed.data.taskId!);
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
    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid taskId", issues: idParsed.error.flatten() });
    }
    response.json(await store.listByTask(idParsed.data.taskId!));
  });

  app.get("/api/tasks/:taskId/executions", async (request, response) => {
    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid taskId", issues: idParsed.error.flatten() });
    }
    response.json(await store.listExecutions(idParsed.data.taskId!));
  });

  app.get("/api/tasks/:taskId/gates", async (request, response) => {
    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid taskId", issues: idParsed.error.flatten() });
    }
    response.json(await store.listGates(idParsed.data.taskId!));
  });

  app.get("/api/workers", async (_request, response) => {
    response.json(await store.listWorkers());
  });

  app.get("/api/workers/:workerId", async (request, response) => {
    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid workerId", issues: idParsed.error.flatten() });
    }
    const worker = await store.getWorker(idParsed.data.workerId!);
    if (!worker) {
      response.status(404).json({ error: "Worker not found." });
      return;
    }
    response.json(worker);
  });

  app.get("/api/workers/:workerId/detail", async (request, response) => {
    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid workerId", issues: idParsed.error.flatten() });
    }
    const worker = await store.getWorker(idParsed.data.workerId!);
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
    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid workerId", issues: idParsed.error.flatten() });
    }
    const queryParsed = MemoryQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      return response.status(400).json({ error: "Invalid query parameters", issues: queryParsed.error.flatten() });
    }
    const { limit, q: query } = queryParsed.data;

    if (query.length > 0) {
      response.json(await store.searchMemory(idParsed.data.workerId!, query, limit));
      return;
    }
    response.json(await store.listRecentMemory(idParsed.data.workerId!, limit));
  });

  app.get("/api/workers/:workerId/sessions", async (request, response) => {
    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid workerId", issues: idParsed.error.flatten() });
    }
    response.json(await store.listSessions(idParsed.data.workerId!));
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

    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid taskId", issues: idParsed.error.flatten() });
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
      idParsed.data.taskId!,
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

    const idParsed = IdParamSchema.safeParse(request.params);
    if (!idParsed.success) {
      return response.status(400).json({ error: "Invalid taskId", issues: idParsed.error.flatten() });
    }
    const gateTypeParsed = z.object({ gateType: z.enum(["review", "release"]) }).safeParse(request.params);
    if (!gateTypeParsed.success) {
      return response.status(400).json({ error: "Invalid gateType", issues: gateTypeParsed.error.flatten() });
    }

    const taskId = idParsed.data.taskId!;
    const gateType = gateTypeParsed.data.gateType;
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

  // Revenue Orchestrator Endpoints
  app.get("/api/revenue/status", async (request, response) => {
    try {
      requireUser(request as AuthenticatedRequest);
      const { getRevenueOrchestrator } = await import("./revenueService.js");
      const orchestrator = getRevenueOrchestrator();
      
      if (!orchestrator) {
        return response.json({
          enabled: false,
          message: "Revenue orchestrator not initialized"
        });
      }
      
      const stats = orchestrator.getStats();
      response.json({
        enabled: true,
        ...stats
      });
    } catch (error) {
      console.error("[Revenue API] Status error:", error);
      response.status(500).json({ error: "Failed to get revenue status" });
    }
  });

  app.post("/api/revenue/start", async (request, response) => {
    try {
      requireApprover(request as AuthenticatedRequest);
      const { initRevenueOrchestrator } = await import("./revenueService.js");
      const orchestrator = await initRevenueOrchestrator(store);
      
      if (!orchestrator.getStats().isRunning) {
        await orchestrator.start();
      }
      
      response.json({
        success: true,
        message: "Revenue orchestrator started",
        stats: orchestrator.getStats()
      });
    } catch (error) {
      console.error("[Revenue API] Start error:", error);
      response.status(500).json({ error: "Failed to start revenue orchestrator" });
    }
  });

  app.post("/api/revenue/stop", async (request, response) => {
    try {
      requireApprover(request as AuthenticatedRequest);
      const { stopRevenueOrchestrator } = await import("./revenueService.js");
      stopRevenueOrchestrator();
      
      response.json({
        success: true,
        message: "Revenue orchestrator stopped"
      });
    } catch (error) {
      console.error("[Revenue API] Stop error:", error);
      response.status(500).json({ error: "Failed to stop revenue orchestrator" });
    }
  });

  app.get("/api/revenue/health", async (request, response) => {
    try {
      requireUser(request as AuthenticatedRequest);
      const { getRevenueOrchestrator } = await import("./revenueService.js");
      const orchestrator = getRevenueOrchestrator();
      
      if (!orchestrator) {
        return response.status(503).json({
          healthy: false,
          message: "Revenue orchestrator not initialized"
        });
      }
      
      const health = await orchestrator.healthCheck();
      const statusCode = health.healthy ? 200 : 503;
      response.status(statusCode).json(health);
    } catch (error) {
      console.error("[Revenue API] Health check error:", error);
      response.status(500).json({ healthy: false, error: "Health check failed" });
    }
  });

  return app;
}
