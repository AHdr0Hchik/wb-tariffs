import Knex from "knex";
import { env } from '../config/env.js';
import { logger } from "../utils/logger.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const migrationsDir = (() => {
  // Если сборка — dist/db/migrations; если dev — src/db/migrations
  const jsDir = path.resolve(__dirname, "migrations");              // dist/db/migrations при сборке
  const tsDir = path.resolve(process.cwd(), "src", "db", "migrations");
  return fs.existsSync(jsDir) ? jsDir : tsDir;
})();

export const knex = Knex({
  client: "pg",
  connection: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  },
  pool: {
    min: 0,
    max: 10,
  },
  migrations: {
    tableName: "knex_migrations",
    directory: migrationsDir,
    extension: "js", // compiled
    loadExtensions: [".js", ".ts"],
  },
});

async function waitDbReady(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await knex.raw("select 1");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("DB is not reachable");
}

export async function migrateLatest() {
  await waitDbReady();
  logger.info("Running migrations...");
  await knex.migrate.latest();
  logger.info("Migrations: OK");
}

export async function destroyKnex() {
  await knex.destroy();
}