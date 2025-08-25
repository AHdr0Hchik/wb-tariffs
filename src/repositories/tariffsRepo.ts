import { knex } from "../db/knex.js";
import { sha1, stableStringify } from "../utils/hash.js";
import type { TariffRow } from "../domain/wbBox.js";

export async function withAdvisoryLock<T>(lockKey: number, fn: () => Promise<T>): Promise<T | null> {
  const res = await knex.raw<{ rows: { locked: boolean }[] }>(
    "select pg_try_advisory_lock(?::bigint) as locked",
    [lockKey]
  );
  const locked = (res as any)?.rows?.[0]?.locked === true;
  if (!locked) return null;
  try {
    return await fn();
  } finally {
    await knex.raw("select pg_advisory_unlock(?::bigint)", [lockKey]);
  }
}

export async function upsertDailySnapshot(day: string, data: any, itemsCount: number) {
  const source_hash = sha1(stableStringify(data as any));
  const row = {
    day,
    data,
    first_fetched_at: knex.fn.now(),
    last_fetched_at: knex.fn.now(),
    items_count: itemsCount,
    source_hash,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  };

  await knex("wb_box_tariffs_daily_snapshots")
    .insert(row)
    .onConflict("day")
    .merge({
      data: row.data,
      last_fetched_at: row.last_fetched_at,
      items_count: row.items_count,
      source_hash: row.source_hash,
      updated_at: row.updated_at,
    });
}

export async function upsertDailyItems(day: string, items: (TariffRow & { fingerprint: string })[]) {
  if (!items.length) return;

  const rows = items.map((i) => ({
    day,
    fingerprint: i.fingerprint,
    warehouse_id: i.warehouseId ?? null,
    warehouse_name: i.warehouseName ?? null,
    box_type: i.boxType ?? null,
    delivery_type: i.deliveryType ?? null,
    region_from: i.regionFrom ?? null,
    region_to: i.regionTo ?? null,
    coef: i.coef,
    meta: i.meta,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  }));

  await knex("wb_box_tariffs_daily_items")
    .insert(rows)
    .onConflict(["day", "fingerprint"])
    .merge({
      warehouse_id: knex.raw("excluded.warehouse_id"),
      warehouse_name: knex.raw("excluded.warehouse_name"),
      box_type: knex.raw("excluded.box_type"),
      delivery_type: knex.raw("excluded.delivery_type"),
      region_from: knex.raw("excluded.region_from"),
      region_to: knex.raw("excluded.region_to"),
      coef: knex.raw("excluded.coef"),
      meta: knex.raw("excluded.meta"),
      updated_at: knex.fn.now(),
    });
}

export async function getLatestDay(): Promise<string | null> {
  const r = await knex("wb_box_tariffs_daily_items").max<{ max: Date }>("day as max").first();
  if (!r?.max) return null;
  return r.max.toISOString().slice(0, 10);
}

export async function getItemsForDaySorted(day: string) {
  return knex("wb_box_tariffs_daily_items")
    .select(
      "day",
      "warehouse_id",
      "warehouse_name",
      "box_type",
      "delivery_type",
      "region_from",
      "region_to",
      "coef"
    )
    .where({ day })
    .orderBy([{ column: "coef", order: "asc" }, { column: "warehouse_id", order: "asc" }]);
}