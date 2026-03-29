export const TASK_QUEUE_PREFIX = "ultimate-system.tasks";

export function taskQueueName(workerId: string) {
  return `${TASK_QUEUE_PREFIX}.${workerId}`;
}

export function parseRedisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null as null
  };
}
