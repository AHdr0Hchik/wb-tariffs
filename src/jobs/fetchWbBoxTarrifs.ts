import { env } from "#/config/env.js";
import { logger } from "#/utils/logger.js";
import { fetchJsonWithRetry } from "#/utils/http.js";
import { parseWbBoxTariffs, buildFingerprint } from "#/domain/wbBox.js";
import { upsertDailyItems, upsertDailySnapshot, withAdvisoryLock } from "#/repositories/tariffsRepo.js";

type AnyObj = Record<string, any>;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildUrl(): string {
  const base = env.WB_TARIFFS_BOX_ENDPOINT.trim();
  const u = new URL(base);

  const dateStr = (env.WB_TARIFFS_BOX_DATE || todayUTC()).trim();

  // Добавим date, если его ещё нет в URL
  if (!u.searchParams.has("date")) {
    u.searchParams.set("date", dateStr);
  }

  // Доп. параметры из WB_TARIFFS_BOX_QUERY (если заданы)
  if (env.WB_TARIFFS_BOX_QUERY && env.WB_TARIFFS_BOX_QUERY.trim()) {
    const rendered = env.WB_TARIFFS_BOX_QUERY.replace(/\{today\}/g, dateStr);
    const extra = new URLSearchParams(rendered);
    for (const [k, v] of extra.entries()) {
      if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    }
  }

  return u.toString();
}

async function fetchWB(): Promise<any | null> {
  const rawToken = env.WB_API_TOKEN?.trim();
  if (!rawToken) return null;

  // Если стандартный Authorization и токен без Bearer — добавим автоматом.
  let tokenHeaderValue = rawToken;
  if (env.WB_AUTH_HEADER_NAME.toLowerCase() === "authorization" && !/^bearer\s/i.test(rawToken)) {
    tokenHeaderValue = `Bearer ${rawToken}`;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    [env.WB_AUTH_HEADER_NAME]: tokenHeaderValue,
  };

  const url = buildUrl();
  return await fetchJsonWithRetry<AnyObj>(url, { method: "GET", headers });
}

export async function fetchAndStoreWbBoxTariffs(): Promise<string | null> {
  return withAdvisoryLock(env.JOB_ADVISORY_LOCK_KEY, async () => {
    const day = todayUTC();

    let payload: any = null;
    try {
      payload = await fetchWB();
    } catch (e) {
      logger.error("WB fetch failed", e);
      return null;
    }

    if (!payload) {
      logger.warn("No WB payload received (no token or fetch failed). Skipping store and sheets update.");
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