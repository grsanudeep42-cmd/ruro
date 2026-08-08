import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RuroConfig } from "../config.js";
import type { RuroReport } from "../types.js";

export interface AnnotateResult {
  annotated: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Optional Copilot annotation layer.
 * Scores stay signal-based. This only writes short narratives under data/ai/.
 * Fails soft when Copilot CLI / credits are unavailable.
 */
export async function annotateWithCopilot(opts: {
  report: RuroReport;
  config: RuroConfig;
  cwd: string;
}): Promise<AnnotateResult> {
  const { report, config, cwd } = opts;
  if (!config.ai.enabled || config.ai.provider !== "copilot") {
    return { annotated: 0, skipped: true, reason: "ai disabled" };
  }

  const cacheDir = resolve(cwd, config.ai.cache_dir);
  mkdirSync(cacheDir, { recursive: true });

  // Soft availability check — do not require Copilot to score.
  const hasCli = await commandExists("copilot");
  if (!hasCli) {
    const stub = {
      generated_at: new Date().toISOString(),
      provider: "copilot",
      status: "unavailable",
      note: "Copilot CLI not found on PATH. Scores unchanged; enable CLI/credits to annotate.",
      repos: [] as Array<{ fullName: string; narrative: string }>,
    };
    writeFileSync(
      join(cacheDir, "latest.json"),
      `${JSON.stringify(stub, null, 2)}\n`,
      "utf8",
    );
    return { annotated: 0, skipped: true, reason: "copilot cli missing" };
  }

  const top = report.repos.slice(0, config.ai.top_n);
  const narratives = top.map((repo) => {
    // Placeholder narrative from signals until live Copilot prompt wiring is configured.
    // Keeps output deterministic and free of external calls in CI by default.
    const narrative = [
      `${repo.signals.name} is ${repo.status} at score ${repo.score}.`,
      repo.drivers.length ? `Drivers: ${repo.drivers.join(", ")}.` : null,
      repo.blockers.length ? `Blockers: ${repo.blockers.join(", ")}.` : null,
      repo.signals.demo.status === "UP"
        ? "Demo responds."
        : "No live demo confirmed.",
    ]
      .filter(Boolean)
      .join(" ");
    return { fullName: repo.signals.fullName, narrative };
  });

  const payload = {
    generated_at: new Date().toISOString(),
    provider: "copilot",
    status: "signal_fallback",
    note: "Live Copilot prompting is gated. Cached signal-derived annotations written for top repos.",
    repos: narratives,
  };
  writeFileSync(
    join(cacheDir, "latest.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  for (const item of narratives) {
    const safe = item.fullName.replace(/[^\w.-]+/g, "_");
    writeFileSync(join(cacheDir, `${safe}.md`), `${item.narrative}\n`, "utf8");
  }

  return { annotated: narratives.length, skipped: false };
}

async function commandExists(bin: string): Promise<boolean> {
  try {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(bin, ["--help"], {
      stdio: "ignore",
      timeout: 2000,
    });
    return result.status === 0 || result.status === 1;
  } catch {
    return false;
  }
}

export function readAiCache(
  cwd: string,
  cacheDir: string,
): { status: string; repos: Array<{ fullName: string; narrative: string }> } | null {
  const path = resolve(cwd, cacheDir, "latest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as {
      status: string;
      repos: Array<{ fullName: string; narrative: string }>;
    };
  } catch {
    return null;
  }
}
