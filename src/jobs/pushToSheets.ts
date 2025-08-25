import { env, sheetsIds } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { getItemsForDaySorted } from "../repositories/tariffsRepo.js";
import { getSheetsClient, ensureSheetExists, writeTable } from "../google/sheets.js";

const SHEET = "stocks_coefs";

export async function pushTariffsToSheets(day: string) {
  if (!env.GOOGLE_SHEETS_ENABLED) {
    logger.info("Sheets update skipped: disabled by env");
    return;
  }
  if (!sheetsIds.length) {
    logger.info("Sheets update skipped: no GOOGLE_SHEETS_IDS");
    return;
  }

  let sheets;
  try {
    sheets = await getSheetsClient();
  } catch (e) {
    logger.warn("Sheets client not available:", (e as Error).message);
    return;
  }

  const items = await getItemsForDaySorted(day);
  const headers = ["day", "warehouse_id", "warehouse_name", "box_type", "delivery_type", "region_from", "region_to", "coef"];
  const rows = items.map((r) => [
    r.day.toISOString().slice(0, 10),
    r.warehouse_id ?? "",
    r.warehouse_name ?? "",
    r.box_type ?? "",
    r.delivery_type ?? "",
    r.region_from ?? "",
    r.region_to ?? "",
    Number(r.coef),
  ]);

  for (const spreadsheetId of sheetsIds) {
    try {
      await ensureSheetExists(sheets, spreadsheetId, SHEET);
      await writeTable(sheets, spreadsheetId, SHEET, headers, rows);
      logger.info(`Sheets updated for ${spreadsheetId}: ${rows.length} rows`);
    } catch (e) {
      logger.error(`Failed to update sheet ${spreadsheetId}`, e);
    }
  }
}