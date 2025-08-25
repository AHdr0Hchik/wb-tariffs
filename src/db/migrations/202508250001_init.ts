import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("wb_box_tariffs_daily_snapshots", (t) => {
    t.date("day").primary().notNullable();
    t.jsonb("data").notNullable();
    t.timestamp("first_fetched_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("last_fetched_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.integer("items_count").notNullable().defaultTo(0);
    t.text("source_hash").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

    await knex.schema.createTable("wb_box_tariffs_daily_items", (t) => {
        t.bigIncrements("id").primary();
        t.date("day").notNullable().index();
        t.text("fingerprint").notNullable();
        t.integer("warehouse_id").nullable().index();
        t.text("warehouse_name").nullable();
        t.text("box_type").nullable();
        t.text("delivery_type").nullable();
        t.text("region_from").nullable();
        t.text("region_to").nullable();
        t.decimal("coef", 12, 6).notNullable().index();
        t.jsonb("meta").notNullable();
        t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

        //  ↓↓↓ here
        t.unique(["day", "fingerprint"], "wb_box_items_day_fingerprint_uk");
        t.index(["day", "coef"], "wb_box_items_day_coef_idx");
        t.index(["fingerprint"], "wb_box_items_fpr_idx");
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("wb_box_tariffs_daily_items");
  await knex.schema.dropTableIfExists("wb_box_tariffs_daily_snapshots");
}