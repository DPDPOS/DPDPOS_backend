import { Queue } from "bullmq";
import { createBullMqConnectionOptions } from "../../infrastructure/queue/bullmq-connection.js";
import { QUEUE_NAMES } from "./queue-names.js";

export const retentionQueue = new Queue(QUEUE_NAMES.RETENTION, {
  connection: createBullMqConnectionOptions(),
});
