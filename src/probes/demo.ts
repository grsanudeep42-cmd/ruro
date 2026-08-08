import type { RuroConfig } from "../config.js";
import type { DemoProbeResult } from "../types.js";

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function probeDemoUrl(
  homepageUrl: string | null | undefined,
  config: RuroConfig,
): Promise<DemoProbeResult> {
  if (!config.probes.enabled) {
    return {
      status: homepageUrl ? "NONE" : "NONE",
      url: homepageUrl ?? null,
      httpStatus: null,
      latencyMs: null,
      error: null,
    };
  }

  const url = homepageUrl ? normalizeUrl(homepageUrl) : null;
  if (!url) {
    return {
      status: "NONE",
      url: null,
      httpStatus: null,
      latencyMs: null,
      error: null,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.probes.timeout_ms);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: config.probes.follow_redirects ? "follow" : "manual",
      signal: controller.signal,
      headers: {
        "user-agent": config.probes.user_agent,
        accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
    });
    const latencyMs = Date.now() - started;
    const ok = response.status >= 200 && response.status < 400;
    return {
      status: ok ? "UP" : "DOWN",
      url,
      httpStatus: response.status,
      latencyMs,
      error: ok ? null : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      status: "ERROR",
      url,
      httpStatus: null,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeAll(
  homepageUrls: Array<string | null>,
  config: RuroConfig,
  concurrency = 6,
): Promise<DemoProbeResult[]> {
  const results: DemoProbeResult[] = new Array(homepageUrls.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < homepageUrls.length) {
      const current = index;
      index += 1;
      results[current] = await probeDemoUrl(homepageUrls[current], config);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, homepageUrls.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
