import { env } from "#/config/env.js";

export async function fetchJsonWithRetry<T>(
  url: string,
  opts: RequestInit & { timeoutMs?: number } = {},
  attempts = 5
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? env.WB_REQUEST_TIMEOUT_MS;
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      // @ts-ignore Node 20: global fetch
      const res = await fetch(url, { ...opts, signal: ac.signal });
      clearTimeout(timer);
      if (!res.ok) {
        let text = "";
        try {
          text = await res.text();
        } catch {}
        const snippet = text ? ` | ${text.slice(0, 800)}` : "";
        lastError = new Error(`HTTP ${res.status} ${res.statusText}${snippet}`);
      } else {
        return (await res.json()) as T;
      }
    } catch (e) {
      lastError = e;
    }
    const backoff = Math.min(5000, 300 * (i + 1)) + Math.floor(Math.random() * 300);
    await new Promise((r) => setTimeout(r, backoff));
  }
  throw lastError;
}