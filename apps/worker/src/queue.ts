import { Queue } from "bullmq";
import { parseRedisConnection, taskQueueName } from "@ultimate-system/core";

export function createTaskQueue(redisUrl: string, workerId: string): Queue {
  return new Queue(taskQueueName(workerId), {
    connection: parseRedisConnection(redisUrl)
  });
}

export async function enqueueTask(queue: Queue, taskId: string, attempts: number): Promise<void> {
  const existing = await queue.getJob(taskId);
  if (existing) {
    const state = await existing.getState();
    if (state === "waiting" || state === "active" || state === "delayed") {
      return;
    }
  }

  await queue.add("task.execute", {
    taskId
  }, {
    jobId: taskId,
    attempts: Math.max(1, attempts),
    backoff: {
      type: "exponential",
      delay: 3000
    },
    removeOnComplete: 50,
    removeOnFail: 200
  });
}
