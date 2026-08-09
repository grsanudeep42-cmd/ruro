import { createHash } from "node:crypto";
import type { RuroConfig } from "../config.js";
import type { DemoProbeResult } from "../types.js";

const PARKING_MARKERS = [
  "buy this domain",
  "domain is for sale",
  "parked domain",
  "coming soon",
  "under construction",
  "this site can’t be reached",
  "this site can't be reached",
  "404 not found",
  "page not found",
  "deployment not found",
  "project not found",
  "vercel 404",
  "netlify 404",
  "there isn't a github pages site here",
  "failed to find a valid digest",
];

export interface ProbeContext {
  repoHtmlUrl?: string | null;
  fullName?: string | null;
  signal?: AbortSignal;
}

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

/** Block probe targets that would hit loopback / link-local / private nets (SSRF). */
export function isBlockedProbeHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "metadata.google.internal") return true;
  if (host === "metadata" || host.endsWith(".metadata.google.internal"))
    return true;

  // IPv4 literals
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map((x) => Number(x));
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  // IPv6 / IPv4-mapped literals (common metadata + loopback)
  if (host.includes(":")) {
    if (
      host === "::1" ||
      host === "::" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80") ||
      host.includes("::ffff:127.") ||
      host.includes("::ffff:10.") ||
      host.includes("::ffff:192.168.") ||
      host.includes("::ffff:169.254.")
    ) {
      return true;
    }
  }
  return false;
}

function isGithubRepoUrl(candidate: string, ctx: ProbeContext): boolean {
  try {
    const u = new URL(candidate);
    if (!/(^|\.)github\.com$/i.test(u.hostname)) return false;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return false;
    if (ctx.fullName) {
      const [o, r] = ctx.fullName.split("/");
      if (
        parts[0]?.toLowerCase() === o?.toLowerCase() &&
        parts[1]?.toLowerCase() === r?.toLowerCase()
      ) {
        return true;
      }
    }
    if (ctx.repoHtmlUrl) {
      const repo = new URL(ctx.repoHtmlUrl);
      return (
        u.hostname === repo.hostname &&
        u.pathname.replace(/\/$/, "") === repo.pathname.replace(/\/$/, "")
      );
    }
    return !u.hostname.endsWith("github.io");
  } catch {
    return false;
  }
}

function isSpaShell(body: string): boolean {
  const lower = body.toLowerCase();
  const hasMount =
    /id=["']root["']/.test(lower) ||
    /id=["']app["']/.test(lower) ||
    /id=["']__next["']/.test(lower) ||
    /data-reactroot/.test(lower);
  const hasBundles =
    /type=["']module["']/.test(lower) ||
    /\/assets\/[^"']+\.js/.test(lower) ||
    /_next\/static/.test(lower) ||
    /vite\.svg/.test(lower);
  const title = lower.match(/<title[^>]*>([^<]{3,120})<\/title>/);
  const hasTitle = Boolean(title?.[1]?.trim() && !/document/i.test(title[1]));
  return hasMount && hasBundles && hasTitle;
}

export function isLiveSpaShell(body: string): boolean {
  return isSpaShell(body);
}

function looksParkedOrFake(body: string, contentType: string | null): boolean {
  const lower = body.slice(0, 80_000).toLowerCase();
  if (PARKING_MARKERS.some((m) => lower.includes(m))) return true;
  if (isSpaShell(body)) return false;
  const isHtml =
    !contentType ||
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml");
  if (isHtml) {
    const textish = lower.replace(/<script[\s\S]*?<\/script>/g, " ");
    const stripped = textish.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length < 40) return true;
  }
  return false;
}

function emptyResult(
  status: DemoProbeResult["status"],
  patch: Partial<DemoProbeResult> = {},
): DemoProbeResult {
  return {
    status,
    url: null,
    finalUrl: null,
    httpStatus: null,
    latencyMs: null,
    error: null,
    proofBytes: null,
    contentType: null,
    verified: false,
    redirectChain: [],
    bodyHash: null,
    spaShell: false,
    probedAt: new Date().toISOString(),
    hashStable: null,
    ...patch,
  };
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function fetchOnce(
  url: string,
  config: RuroConfig,
  signal: AbortSignal,
): Promise<{
  response: Response;
  buf: Buffer;
  latencyMs: number;
  finalUrl: string;
}> {
  const started = Date.now();
  const response = await fetch(url, {
    method: "GET",
    redirect: config.probes.follow_redirects ? "follow" : "manual",
    signal,
    headers: {
      "user-agent": config.probes.user_agent,
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    },
  });
  const buf = Buffer.from(await response.arrayBuffer());
  return {
    response,
    buf,
    latencyMs: Date.now() - started,
    finalUrl: response.url || url,
  };
}

/**
 * Prove a homepage is a real live deployment — not github.com/repo.
 * Stores auditable fields: hash, SPA flag, redirect final, optional stability.
 */
export async function probeDemoUrl(
  homepageUrl: string | null | undefined,
  config: RuroConfig,
  ctx: ProbeContext = {},
): Promise<DemoProbeResult> {
  if (!config.probes.enabled) {
    return emptyResult("NONE", {
      url: homepageUrl ?? null,
      verified: false,
      probedAt: new Date().toISOString(),
    });
  }

  const url = homepageUrl ? normalizeUrl(homepageUrl) : null;
  if (!url) return emptyResult("NONE");

  if (isGithubRepoUrl(url, ctx)) {
    return emptyResult("DOWN", {
      url,
      finalUrl: url,
      error: "homepage_is_github_repo_not_deploy",
      redirectChain: [url],
    });
  }

  try {
    const host = new URL(url).hostname;
    if (isBlockedProbeHost(host)) {
      return emptyResult("DOWN", {
        url,
        finalUrl: url,
        error: "homepage_blocked_ssrf",
        redirectChain: [url],
      });
    }
  } catch {
    return emptyResult("NONE");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.probes.timeout_ms);
  if (ctx.signal) {
    if (ctx.signal.aborted) {
      clearTimeout(timer);
      return emptyResult("ERROR", {
        url,
        error: "aborted",
      });
    }
    ctx.signal.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
  }

  try {
    const first = await fetchOnce(url, config, controller.signal);
    const { response, buf, latencyMs, finalUrl } = first;
    const contentType = response.headers.get("content-type");
    const proofBytes = buf.byteLength;
    const bodyText = buf.toString("utf8");
    const bodyHash = sha256(buf);
    const spaShell = isSpaShell(bodyText);
    const redirectChain =
      finalUrl && finalUrl !== url ? [url, finalUrl] : [url];

    if (isGithubRepoUrl(finalUrl, ctx)) {
      return emptyResult("DOWN", {
        url,
        finalUrl,
        httpStatus: response.status,
        latencyMs,
        error: "redirected_to_github_repo",
        proofBytes,
        contentType,
        redirectChain,
        bodyHash,
        spaShell,
      });
    }

    try {
      const finalHost = new URL(finalUrl).hostname;
      if (isBlockedProbeHost(finalHost)) {
        return emptyResult("DOWN", {
          url,
          finalUrl,
          httpStatus: response.status,
          latencyMs,
          error: "redirected_to_blocked_host",
          proofBytes,
          contentType,
          redirectChain,
          bodyHash,
          spaShell,
        });
      }
    } catch {
      /* keep going — finalUrl parse failure handled as normal DOWN paths */
    }

    const httpOk = response.status >= 200 && response.status < 400;
    if (!httpOk) {
      return emptyResult("DOWN", {
        url,
        finalUrl,
        httpStatus: response.status,
        latencyMs,
        error: `HTTP ${response.status}`,
        proofBytes,
        contentType,
        redirectChain,
        bodyHash,
        spaShell,
      });
    }

    if (proofBytes < 64) {
      return emptyResult("DOWN", {
        url,
        finalUrl,
        httpStatus: response.status,
        latencyMs,
        error: "empty_or_tiny_response",
        proofBytes,
        contentType,
        redirectChain,
        bodyHash,
        spaShell,
      });
    }

    if (looksParkedOrFake(bodyText, contentType)) {
      return emptyResult("DOWN", {
        url,
        finalUrl,
        httpStatus: response.status,
        latencyMs,
        error: "parking_or_soft_404",
        proofBytes,
        contentType,
        redirectChain,
        bodyHash,
        spaShell,
      });
    }

    // Stability: second GET; hash match strengthens proof (soft — does not fail verify)
    let hashStable: boolean | null = null;
    try {
      const second = await fetchOnce(finalUrl, config, controller.signal);
      hashStable = sha256(second.buf) === bodyHash;
    } catch {
      hashStable = null;
    }

    return {
      status: "UP",
      url,
      finalUrl,
      httpStatus: response.status,
      latencyMs,
      error: null,
      proofBytes,
      contentType,
      verified: true,
      redirectChain,
      bodyHash,
      spaShell,
      probedAt: new Date().toISOString(),
      hashStable,
    };
  } catch (err) {
    return emptyResult("ERROR", {
      url,
      finalUrl: null,
      latencyMs: null,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function probeAll(
  repos: Array<{
    homepageUrl: string | null;
    url: string;
    fullName: string;
  }>,
  config: RuroConfig,
  concurrency = 6,
  signal?: AbortSignal,
): Promise<DemoProbeResult[]> {
  const results: DemoProbeResult[] = new Array(repos.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < repos.length) {
      if (signal?.aborted) {
        throw new Error("aborted");
      }
      const current = index;
      index += 1;
      const repo = repos[current];
      results[current] = await probeDemoUrl(repo.homepageUrl, config, {
        repoHtmlUrl: repo.url,
        fullName: repo.fullName,
        signal,
      });
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, repos.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
