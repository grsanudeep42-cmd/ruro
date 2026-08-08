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
  /** e.g. https://github.com/acme/alpha — rejected as a "deployment" */
  repoHtmlUrl?: string | null;
  fullName?: string | null;
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
    // Any bare github.com/owner/repo (no github.io) is not a product deploy.
    return !u.hostname.endsWith("github.io");
  } catch {
    return false;
  }
}

function looksParkedOrFake(body: string, contentType: string | null): boolean {
  const lower = body.slice(0, 80_000).toLowerCase();
  if (PARKING_MARKERS.some((m) => lower.includes(m))) return true;
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
    ...patch,
  };
}

/**
 * Prove a homepage is a real live deployment — not a claimed URL, not github.com/repo.
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
    });
  }

  const url = homepageUrl ? normalizeUrl(homepageUrl) : null;
  if (!url) {
    return emptyResult("NONE");
  }

  if (isGithubRepoUrl(url, ctx)) {
    return emptyResult("DOWN", {
      url,
      finalUrl: url,
      error: "homepage_is_github_repo_not_deploy",
      verified: false,
    });
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
    const finalUrl = response.url || url;
    const contentType = response.headers.get("content-type");
    const buf = Buffer.from(await response.arrayBuffer());
    const proofBytes = buf.byteLength;
    const bodyText = buf.toString("utf8");

    if (isGithubRepoUrl(finalUrl, ctx)) {
      return emptyResult("DOWN", {
        url,
        finalUrl,
        httpStatus: response.status,
        latencyMs,
        error: "redirected_to_github_repo",
        proofBytes,
        contentType,
        verified: false,
      });
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
        verified: false,
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
        verified: false,
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
        verified: false,
      });
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
    };
  } catch (err) {
    return emptyResult("ERROR", {
      url,
      finalUrl: null,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      verified: false,
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
): Promise<DemoProbeResult[]> {
  const results: DemoProbeResult[] = new Array(repos.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < repos.length) {
      const current = index;
      index += 1;
      const repo = repos[current];
      results[current] = await probeDemoUrl(repo.homepageUrl, config, {
        repoHtmlUrl: repo.url,
        fullName: repo.fullName,
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
