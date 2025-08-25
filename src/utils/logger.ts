import log4js from "log4js";
import { env } from "../config/env.js";

log4js.configure({
  appenders: {
    out: { type: "stdout" },
  },
  categories: {
    default: { appenders: ["out"], level: env.LOG_LEVEL },
  },
});

export const logger = log4js.getLogger();