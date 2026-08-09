import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RuroReport, ScoredRepo } from "../types.js";

export type RegressionKind =
  | "status_flip"
  | "score_drop"
  | "demo_lost"
  | "new_blocker";

export interface FleetRegression {
  kind: RegressionKind;
  fullName: string;
  name: string;
  detail: string;
}

/** Compare current report to a previous snapshot. */
export function computeRegressions(
  previous: RuroReport | null,
  current: RuroReport,
): FleetRegression[] {
  if (!previous) return [];
  const prevMap = new Map(previous.repos.map((r) => [r.signals.fullName, r]));
  const out: FleetRegression[] = [];

  for (const repo of current.repos) {
    const prior = prevMap.get(repo.signals.fullName);
    if (!prior) continue;

    if (prior.status !== repo.status) {
      out.push({
        kind: "status_flip",
        fullName: repo.signals.fullName,
        name: repo.signals.name,
        detail: `${prior.status} → ${repo.status}`,
      });
    }

    if (repo.score <= prior.score - 5) {
      out.push({
        kind: "score_drop",
        fullName: repo.signals.fullName,
        name: repo.signals.name,
        detail: `score ${prior.score} → ${repo.score}`,
      });
    }

    if (prior.signals.demo.verified && !repo.signals.demo.verified) {
      out.push({
        kind: "demo_lost",
        fullName: repo.signals.fullName,
        name: repo.signals.name,
        detail: `lost verified deploy (${repo.signals.demo.error ?? repo.signals.demo.status})`,
      });
    }

    const priorBlock = new Set(prior.blockers);
    for (const b of repo.blockers) {
      if (!priorBlock.has(b) && /no_ci|demo_|homepage_|ci_failing|no_tests/.test(b)) {
        out.push({
          kind: "new_blocker",
          fullName: repo.signals.fullName,
          name: repo.signals.name,
          detail: `new blocker: ${b}`,
        });
      }
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Load newest history file older than current generated_at, or previous day. */
export function loadPreviousHistory(
  historyDir: string,
  cwd: string,
  currentGeneratedAt: string,
): RuroReport | null {
  const root = resolve(cwd, historyDir);
  if (!existsSync(root)) return null;
  const days = readdirSync(root)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
    .reverse();

  const currentDay = currentGeneratedAt.slice(0, 10);
  for (const day of days) {
    if (day >= currentDay) continue;
    try {
      const parsed = JSON.parse(
        readFileSync(join(root, `${day}.json`), "utf8"),
      ) as RuroReport;
      if (parsed?.schema_version === 1 && Array.isArray(parsed.repos)) return parsed;
    } catch {
      /* skip */
    }
  }
  return null;
}

export function topHurts(repos: ScoredRepo[], n = 5): Array<{
  repo: ScoredRepo;
  blocker: string;
}> {
  const rows: Array<{ repo: ScoredRepo; blocker: string; weight: number }> = [];
  for (const repo of repos) {
    for (const b of repo.blockers.slice(0, 3)) {
      const weight =
        (b.includes("demo") || b.includes("ci") || b.includes("test") ? 3 : 1) +
        (100 - repo.score) / 100;
      rows.push({ repo, blocker: b, weight });
    }
  }
  return rows
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map(({ repo, blocker }) => ({ repo, blocker }));
}
