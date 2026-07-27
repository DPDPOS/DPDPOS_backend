import pino from "pino";
import { appConfig } from "../../config/app.config.js";

export const logger = pino({
  level: appConfig.logLevel,
  base: { service: "dpdpos-backend" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
