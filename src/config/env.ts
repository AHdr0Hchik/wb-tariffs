import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  TZ: z.string().default("UTC"),
  LOG_LEVEL: z.string().default("info"),

  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("password"),
  DB_NAME: z.string().default("wb-test"),

  WB_TARIFFS_BOX_ENDPOINT: z.string().url().default("https://common-api.wildberries.ru/api/v1/tariffs/box"),
  WB_API_TOKEN: z.string().optional(),
  WB_AUTH_HEADER_NAME: z.string().default("Authorization"),
  WB_FETCH_INTERVAL_MS: z.coerce.number().default(60 * 60 * 1000),
  WB_REQUEST_TIMEOUT_MS: z.coerce.number().default(15000),
  

  GOOGLE_SHEETS_ENABLED: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
  GOOGLE_SHEETS_IDS: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  JOB_ADVISORY_LOCK_KEY: z.coerce.number().int().nonnegative().default(834234234),
});

export const env = envSchema.parse(process.env);

export const sheetsIds = (env.GOOGLE_SHEETS_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);