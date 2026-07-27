import { Queue } from "bullmq";
import { createBullMqConnectionOptions } from "../../infrastructure/queue/bullmq-connection.js";
import { QUEUE_NAMES } from "./queue-names.js";

export const notificationQueue = new Queue(QUEUE_NAMES.NOTIFICATION, {
  connection: createBullMqConnectionOptions(),
});
