import { sha1, stableStringify } from "#/utils/hash.js";

export interface TariffRow {
  warehouseName?: string | null;
  boxType?: string | null;        // "box"
  deliveryType?: string | null;   // "storage" | "delivery" | "delivery_marketplace"
  region?: string | null;         // единое поле региона/географии
  coef: number;                   // коэффициент как число (например 1.95)
  meta: any;                      // полный исходный элемент
}

// --- helpers ---

function parseRusNumber(val: any): number | null {
  if (val == null) return null;
  if (typeof val !== "string") return Number.isFinite(val) ? Number(val) : null;
  const s = val.trim();
  if (!s || s === "-") return null;
  const normalized = s.replace(/\s+/g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseCoefExpr(expr: any): number | null {
  const n = parseRusNumber(expr);
  if (n == null) return null;
  // В ответе WB "195" означает 1.95, "105" -> 1.05
  return n / 100;
}

// --- основной парсер для структуры response.data.warehouseList ---

function parseFromWarehouseList(payload: any): TariffRow[] {
  const data = payload?.response?.data ?? payload?.data ?? payload;
  const list = data?.warehouseList;
  if (!Array.isArray(list)) return [];

  const items: TariffRow[] = [];
  for (const wh of list) {
    const storageCoef = parseCoefExpr(wh.boxStorageCoefExpr);
    const deliveryCoef = parseCoefExpr(wh.boxDeliveryCoefExpr);
    const marketplaceDeliveryCoef = parseCoefExpr(wh.boxDeliveryMarketplaceCoefExpr);

    const baseRow = {
      warehouseName: (wh.warehouseName ?? null) as string | null,
      boxType: "box",
      region: (wh.geoName ?? null) as string | null,
      meta: wh,
    };

    if (storageCoef != null) {
      items.push({
        ...baseRow,
        deliveryType: "storage",
        coef: storageCoef,
      });
    }
    if (deliveryCoef != null) {
      items.push({
        ...baseRow,
        deliveryType: "delivery",
        coef: deliveryCoef,
      });
    }
    if (marketplaceDeliveryCoef != null) {
      items.push({
        ...baseRow,
        deliveryType: "delivery_marketplace",
        coef: marketplaceDeliveryCoef,
      });
    }
  }
  return items;
}

// --- запасной эвристический парсер (если структура другая) ---

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
        if (typeof v === "string") {
          const num = parseRusNumber(v);
          if (num != null && includes.some((inc) => k.toLowerCase().includes(inc))) return num;
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

export function parseWbBoxTariffs(payload: any): TariffRow[] {
  // Специализированный путь для текущего эндпоинта
  const specialized = parseFromWarehouseList(payload);
  if (specialized.length) return specialized;

  // fallback — эвристика
  const arr = toArray(payload);
  const items: TariffRow[] = [];
  for (const el of arr) {
    const coef =
      deepFindNumberByKeyIncludes(el, ["coef", "coeff", "coefficient", "koef", "kof"]) ??
      deepFindNumberByKeyIncludes(el, ["ratio", "multiplier"]);
    if (typeof coef !== "number" || !Number.isFinite(coef)) continue;

    const warehouseName =
      deepFindStringByKeys(el, ["warehouseName", "warehouse", "whName", "warehouse_name"]) ?? null;
    const boxType =
      deepFindStringByKeys(el, ["boxType", "type", "cargoType", "box_type"]) ?? "box";
    const deliveryType =
      deepFindStringByKeys(el, ["deliveryType", "shipmentType", "delivery", "direction"]) ?? null;
    const region =
      deepFindStringByKeys(el, ["region", "regionTo", "toRegion", "destination", "to", "geoName"]) ??
      deepFindStringByKeys(el, ["regionFrom", "fromRegion", "from", "source"]) ??
      null;

    items.push({
      warehouseName,
      boxType,
      deliveryType,
      region,
      coef,
      meta: el,
    });
  }
  return items;
}

export function buildFingerprint(row: TariffRow): string {
  const key = {
    warehouseName: row.warehouseName ?? null,
    boxType: row.boxType ?? null,
    deliveryType: row.deliveryType ?? null,
    region: row.region ?? null,
  };
  return sha1(stableStringify(key));
}