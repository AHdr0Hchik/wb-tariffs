import crypto from "node:crypto";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function sortKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object" && value.constructor === Object) {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = sortKeys(value[k]);
    }
    return out;
  }
  return value;
}

export function stableStringify(value: Json) {
  return JSON.stringify(sortKeys(value));
}

export function sha1(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex");
}