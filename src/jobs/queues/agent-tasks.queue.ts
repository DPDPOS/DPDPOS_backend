import { Queue } from "bullmq";
import { createBullMqConnectionOptions } from "../../infrastructure/queue/bullmq-connection.js";
import { QUEUE_NAMES } from "./queue-names.js";

export const agentTasksQueue = new Queue(QUEUE_NAMES.AGENT_TASKS, {
  connection: createBullMqConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  },
});
