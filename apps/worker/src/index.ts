import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { Worker as QueueWorker } from "bullmq";
import {
  BoundedRetryPolicy,
  CapabilityDispatchPolicy,
  ConservativeBudgetPolicy,
  PaperclipClient,
  WorkerRunService,
  createDefaultWorker,
  nowIso,
  parseRedisConnection,
  taskQueueName
} from "@ultimate-system/core";
import { SqlitePlatformStore } from "@ultimate-system/sqlite-store";
import {
  databasePath,
  heartbeatMs,
  paperclipUrl,
  queueConcurrency,
  redisUrl,
  workerCapabilities,
  workerId as configuredWorkerId,
  workerName as configuredWorkerName
} from "./env.js";
import { createWorkerAdapterFromEnv } from "./runtimeAdapters.js";
import { createTaskQueue, enqueueTask } from "./queue.js";
import { FilesystemSkillRegistry } from "./skillRegistry.js";

const lifecycleStore = new SqlitePlatformStore(databasePath);
const adapter = createWorkerAdapterFromEnv();
const paperclip = new PaperclipClient(paperclipUrl);
const defaultWorker = createDefaultWorker([adapter.executionMode]);
const adapterRuntime = await adapter.describeRuntime?.() ?? {};
const advertisedCapabilities = Array.from(new Set([
  ...(workerCapabilities.length > 0 ? workerCapabilities : defaultWorker.capabilities),
  ...(adapterRuntime.capabilities ?? [])
])).sort();
const worker = {
  ...defaultWorker,
  id: configuredWorkerId ?? `${defaultWorker.id}-${hostname()}-${process.pid}`,
  name: configuredWorkerName ?? `${defaultWorker.name} (${hostname()}:${process.pid})`,
  adapter: adapter.name,
  capabilities: advertisedCapabilities,
  updatedAt: nowIso()
};

await lifecycleStore.seedDefaults();
const recoveredTasks = await lifecycleStore.recoverTasksForWorker(
  worker.id,
  nowIso(),
  `Recovered stale task after ${worker.name} restarted.`
);
await lifecycleStore.registerWorker(worker);
await lifecycleStore.publish({
  id: randomUUID(),
  taskId: null,
  workerId: worker.id,
  eventType: "worker.registered",
  actor: worker.name,
  detail: {
    adapter: adapter.name,
    executionMode: adapter.executionMode,
    redisUrl,
    runtime: adapterRuntime.metadata ?? null
  },
  createdAt: nowIso()
});
for (const recoveredTask of recoveredTasks) {
  await lifecycleStore.publish({
    id: randomUUID(),
    taskId: recoveredTask.id,
    workerId: worker.id,
    eventType: "task.retry_scheduled",
    actor: worker.name,
    detail: {
      error: recoveredTask.lastError,
      retryCount: recoveredTask.retryCount,
      recovery: "worker-startup"
    },
    createdAt: nowIso()
  });
}

function createRunContext() {
  const jobStore = new SqlitePlatformStore(databasePath);
  const runService = new WorkerRunService(
    jobStore,
    new ConservativeBudgetPolicy(),
    new FilesystemSkillRegistry(),
    new CapabilityDispatchPolicy(),
    new BoundedRetryPolicy(),
    adapter
  );

  return {
    jobStore,
    runService
  };
}

const workerQueueName = taskQueueName(worker.id);
const taskQueue = createTaskQueue(redisUrl, worker.id);

let activeJobs = 0;

async function syncPaperclipStatus(taskId: string, store: SqlitePlatformStore = lifecycleStore) {
  const task = await store.getTask(taskId);
  if (!task?.integrationRefs?.paperclip?.issueId) {
    return;
  }
  await paperclip.updateIssueStatus(task.integrationRefs.paperclip.issueId, task);
}

async function syncPaperclipArtifacts(taskId: string, store: SqlitePlatformStore = lifecycleStore) {
  const task = await store.getTask(taskId);
  const issueId = task?.integrationRefs?.paperclip?.issueId;
  if (!task || !issueId || !task.artifacts) {
    return;
  }

  await paperclip.upsertIssueDocument(
    issueId,
    "spec",
    `Spec: ${task.title}`,
    task.artifacts.specDoc,
    "Synced from Ultimate System task artifacts."
  );
  await paperclip.upsertIssueDocument(
    issueId,
    "plan",
    `Plan: ${task.title}`,
    task.artifacts.planDoc,
    "Synced from Ultimate System task artifacts."
  );

  const statusLine = task.status === "failed"
    ? `Task failed in Ultimate System: ${task.lastError ?? "unknown error"}`
    : `Task ${task.status} in Ultimate System.`;
  const releaseLine = task.releaseDecision
    ? [
        `Release allowed: ${task.releaseDecision.allowed ? "yes" : "no"}`,
        `Blocking reasons: ${task.releaseDecision.blockingReasons.join("; ") || "none"}`
      ].join("\n")
    : "Release decision not recorded.";

  await paperclip.addIssueComment(
    issueId,
    [
      `Ultimate System status sync for **${task.title}**`,
      "",
      statusLine,
      "",
      `Summary: ${task.resultSummary ?? task.lastError ?? "No summary recorded."}`,
      "",
      releaseLine
    ].join("\n")
  );
}

async function sendHeartbeat() {
  const heartbeatAt = nowIso();
  await lifecycleStore.heartbeat(worker.id, heartbeatAt);
  await lifecycleStore.publish({
    id: randomUUID(),
    taskId: null,
    workerId: worker.id,
    eventType: "worker.heartbeat",
    actor: worker.name,
    detail: {
      status: activeJobs > 0 ? "busy" : "idle",
      concurrency: queueConcurrency
    },
    createdAt: heartbeatAt
  });
}

const queueWorker = new QueueWorker(
  workerQueueName,
  async (job) => {
    const taskId = typeof job.data?.taskId === "string" ? job.data.taskId : null;
    if (!taskId) {
      throw new Error("Queue job is missing taskId.");
    }

    activeJobs += 1;
    const { jobStore, runService } = createRunContext();
    try {
      const queuedSnapshot = await jobStore.getTask(taskId);
      console.log("worker dequeued task", JSON.stringify({
        taskId,
        queuedSnapshot: queuedSnapshot
          ? {
              status: queuedSnapshot.status,
              approvalState: queuedSnapshot.approvalState,
              assignedWorkerId: queuedSnapshot.assignedWorkerId
            }
          : null
      }));
      const result = await runService.runTask(worker.id, taskId);
      console.log("worker runTask result", JSON.stringify({
        taskId,
        result: result
          ? {
              status: result.status,
              approvalState: result.approvalState,
              assignedWorkerId: result.assignedWorkerId,
              lastError: result.lastError
            }
          : null
      }));
      await syncPaperclipStatus(taskId, jobStore);
      if (result?.status === "completed" || result?.status === "released" || result?.status === "failed") {
        await syncPaperclipArtifacts(taskId, jobStore);
      }

      if (!result) {
        const latest = await jobStore.getTask(taskId);
        console.error("worker missing task result", JSON.stringify({
          taskId,
          latest
        }));
        if (!latest) {
          throw new Error(`Task ${taskId} was not visible to the worker store at dequeue time.`);
        }
        if (latest.status === "queued") {
          throw new Error(`Task ${taskId} remained queued after dequeue.`);
        }
        return { taskId, status: latest?.status ?? "missing" };
      }

      if (result.status === "queued") {
        throw new Error(result.lastError ?? `Task ${taskId} scheduled for retry.`);
      }

      return {
        taskId,
        status: result.status,
        approvalState: result.approvalState
      };
    } finally {
      activeJobs -= 1;
      jobStore.close();
    }
  },
  {
    connection: parseRedisConnection(redisUrl),
    concurrency: queueConcurrency,
    lockDuration: 300_000
  }
);

queueWorker.on("completed", async (job, result) => {
  await lifecycleStore.publish({
    id: randomUUID(),
    taskId: typeof job.data?.taskId === "string" ? job.data.taskId : null,
    workerId: worker.id,
    eventType: "execution.recorded",
    actor: worker.name,
    detail: {
      queueJobId: job.id,
      result
    },
    createdAt: nowIso()
  });
});

queueWorker.on("failed", async (job, error) => {
  await lifecycleStore.publish({
    id: randomUUID(),
    taskId: typeof job?.data?.taskId === "string" ? job.data.taskId : null,
    workerId: worker.id,
    eventType: "task.retry_scheduled",
    actor: worker.name,
    detail: {
      queueJobId: job?.id ?? null,
      error: error.message
    },
    createdAt: nowIso()
  });
});

await sendHeartbeat();
const queuedTasks = await lifecycleStore.listQueuedTasks();
for (const task of queuedTasks) {
  const missingCapabilities = task.requiredCapabilities.filter(
    (capability) => !worker.capabilities.includes(capability)
  );
  if (task.approvalState === "approved"
    && missingCapabilities.length === 0
    && worker.executionModes.includes(task.executionMode)) {
    await enqueueTask(taskQueue, task.id, task.maxRetries + 1);
  }
}
setInterval(() => {
  void sendHeartbeat();
}, heartbeatMs);

const shutdown = async (signal: string) => {
  console.log(`worker shutdown requested by ${signal}`);
  await queueWorker.close();
  await taskQueue.close();
  lifecycleStore.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

console.log(`worker runtime active against ${databasePath} using ${adapter.name} on ${workerQueueName}`);
