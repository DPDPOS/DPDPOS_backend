import { Queue } from "bullmq";
import { createBullMqConnectionOptions } from "../../infrastructure/queue/bullmq-connection.js";
import { QUEUE_NAMES } from "./queue-names.js";

export const reportQueue = new Queue(QUEUE_NAMES.REPORT, {
  connection: createBullMqConnectionOptions(),
});
