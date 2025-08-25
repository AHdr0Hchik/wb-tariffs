import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { knex, migrateLatest, destroyKnex } from "./db/knex.js";
import { fetchAndStoreWbBoxTariffs } from "./jobs/fetchWbBoxTarrifs.js";
import { pushTariffsToSheets } from "./jobs/pushToSheets.js";

process.env.TZ = env.TZ;

async function cycle() {
  try {
    const day = await fetchAndStoreWbBoxTariffs();
    if (day) {
      await pushTariffsToSheets(day);
    }
  } catch (e) {
    logger.error("Cycle failed", e);
  }
}

async function main() {
  logger.info("Starting app...");
  await migrateLatest();

  // run immediately
  await cycle();

  // schedule
  const interval = setInterval(cycle, env.WB_FETCH_INTERVAL_MS);
  logger.info(`Scheduler started. Every ${env.WB_FETCH_INTERVAL_MS / 1000}s`);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    clearInterval(interval);
    await destroyKnex();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((e) => {
  logger.fatal("Fatal on start", e);
  process.exit(1);
});