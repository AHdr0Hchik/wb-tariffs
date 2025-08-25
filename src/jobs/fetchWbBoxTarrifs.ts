import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { fetchJsonWithRetry } from "../utils/http.js";
import { parseWbBoxTariffs, buildFingerprint } from "../domain/wbBox.js";
import { upsertDailyItems, upsertDailySnapshot, withAdvisoryLock } from "../repositories/tariffsRepo.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type AnyObj = Record<string, any>;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchWB(): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.WB_API_TOKEN) {
    headers[env.WB_AUTH_HEADER_NAME] = env.WB_API_TOKEN;
  }

  return fetchJsonWithRetry<AnyObj>(env.WB_TARIFFS_BOX_ENDPOINT, {
    method: "GET",
    headers,
  });
}



export async function fetchAndStoreWbBoxTariffs(): Promise<string | null> {
  return withAdvisoryLock(env.JOB_ADVISORY_LOCK_KEY, async () => {
    const day = todayUTC();

    let payload: any;
    
    payload = env.WB_API_TOKEN ? await fetchWB() : null;
    
    if (!payload) {
      logger.warn("No payload received. Skipping.");
      return null;
    }

    const rows = parseWbBoxTariffs(payload).map((r) => ({ ...r, fingerprint: buildFingerprint(r) }));
    logger.info(`WB payload parsed: ${rows.length} rows for day ${day}`);

    await upsertDailySnapshot(day, payload, rows.length);
    await upsertDailyItems(day, rows);

    logger.info("WB snapshot/items upserted");
    return day;
  });
}