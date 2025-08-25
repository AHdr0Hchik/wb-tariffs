import { sha1, stableStringify } from "../utils/hash.js";

// Гибкое извлечение полей из произвольных объектов WB.
// WB может менять структуру — мы ищем по эвристикам.
export interface TariffRow {
  warehouseId?: number | null;
  warehouseName?: string | null;
  boxType?: string | null;
  deliveryType?: string | null;
  regionFrom?: string | null;
  regionTo?: string | null;
  coef: number;
  meta: any;
}

function toArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["data", "tariffs", "boxes", "result", "items"]) {
      if (Array.isArray((payload as any)[key])) return (payload as any)[key];
    }
  }
  return [payload];
}

function deepFindNumberByKeyIncludes(obj: any, includes: string[]): number | undefined {
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
    } else if (typeof cur === "object") {
      for (const [k, v] of Object.entries(cur)) {
        if (typeof v === "number" && includes.some((inc) => k.toLowerCase().includes(inc))) {
          return v;
        }
        if (v && (typeof v === "object" || Array.isArray(v))) stack.push(v);
      }
    }
  }
  return undefined;
}

function deepFindStringByKeys(obj: any, keys: string[]): string | undefined {
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
    } else if (typeof cur === "object") {
      for (const [k, v] of Object.entries(cur)) {
        if (typeof v === "string" && keys.includes(k)) return v;
        if (v && (typeof v === "object" || Array.isArray(v))) stack.push(v);
      }
    }
  }
  return undefined;
}

function deepFindNumberByKeys(obj: any, keys: string[]): number | undefined {
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
    } else if (typeof cur === "object") {
      for (const [k, v] of Object.entries(cur)) {
        if (typeof v === "number" && keys.includes(k)) return v;
        if (Array.isArray(v) && v.length && typeof v[0] === "number" && keys.includes(k)) {
          return v[0] as number;
        }
        if (v && (typeof v === "object" || Array.isArray(v))) stack.push(v);
      }
    }
  }
  return undefined;
}

export function parseWbBoxTariffs(payload: any): TariffRow[] {
  const arr = toArray(payload);
  const items: TariffRow[] = [];

  for (const el of arr) {
    // 1) коэффициент
    const coef =
      deepFindNumberByKeyIncludes(el, ["coef", "coeff", "coefficient", "koef", "kof"]) ??
      // fallback: число 0 < v < 100 в поле с ratio
      deepFindNumberByKeyIncludes(el, ["ratio", "multiplier"]);
    if (typeof coef !== "number" || !Number.isFinite(coef)) continue;

    // 2) остальные поля эвристикой
    const warehouseId =
      deepFindNumberByKeys(el, ["warehouseId", "warehouse_id", "whId", "warehouseNumber"]) ?? null;
    const warehouseName =
      deepFindStringByKeys(el, ["warehouseName", "warehouse", "whName", "warehouse_name"]) ?? null;
    const boxType =
      deepFindStringByKeys(el, ["boxType", "type", "cargoType", "box_type"]) ?? "box";
    const deliveryType =
      deepFindStringByKeys(el, ["deliveryType", "shipmentType", "delivery", "direction"]) ?? null;
    const regionFrom =
      deepFindStringByKeys(el, ["from", "source", "regionFrom", "fromRegion", "from_name"]) ?? null;
    const regionTo =
      deepFindStringByKeys(el, ["to", "destination", "regionTo", "toRegion", "to_name"]) ?? null;

    items.push({
      warehouseId,
      warehouseName,
      boxType,
      deliveryType,
      regionFrom,
      regionTo,
      coef,
      meta: el,
    });
  }

  return items;
}

export function buildFingerprint(row: TariffRow): string {
  const key = {
    warehouseId: row.warehouseId ?? null,
    warehouseName: row.warehouseName ?? null,
    boxType: row.boxType ?? null,
    deliveryType: row.deliveryType ?? null,
    regionFrom: row.regionFrom ?? null,
    regionTo: row.regionTo ?? null,
    // coef намеренно не включаем, чтобы обновления попадали в тот же ключ
  };
  return sha1(stableStringify(key));
}