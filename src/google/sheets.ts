import { google } from "googleapis";
import { env, sheetsIds } from "../config/env.js";
import { logger } from "../utils/logger.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function normalizePrivateKey(pk: string) {
  // возможны \n в одной строке
  return pk.replace(/\\n/g, "\n");
}

export async function getSheetsClient() {
  

  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    const auth = new google.auth.GoogleAuth({
      keyFilename: env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: SCOPES,
    });
    return google.sheets({ version: "v4", auth });
  }

  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: normalizePrivateKey(creds.private_key),
      scopes: SCOPES,
    });
    return google.sheets({ version: "v4", auth });
  }

  throw new Error("No Google credentials provided");
}

export async function ensureSheetExists(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, title: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === title);
  if (existing) return existing.properties?.sheetId!;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  logger.info(`Added sheet '${title}' to ${spreadsheetId}`);
  const meta2 = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const created = meta2.data.sheets?.find((s) => s.properties?.title === title);
  return created?.properties?.sheetId!;
}

export async function writeTable(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetTitle: string,
  headers: string[],
  rows: (string | number | null)[][]
) {
  // clear
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetTitle}!A1:Z100000`,
  });
  // write
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [headers, ...rows],
    },
  });
}