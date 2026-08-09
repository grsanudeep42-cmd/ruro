import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RuroConfig } from "../config.js";
import type { RuroReport, ScoredRepo } from "../types.js";

/** Fill fields added after older scorecards so CLI never crashes on missing arrays. */
export function normalizeReport(report: RuroReport): RuroReport {
  return {
    ...report,
    regressions: report.regressions ?? [],
    repos: report.repos.map(normalizeRepo),
  };
}

function normalizeRepo(repo: ScoredRepo): ScoredRepo {
  const s = repo.signals;
  const fitness = s.fitness ?? {
    score: 0,
    sourceFiles: 0,
    testFiles: 0,
    otherFiles: 0,
    maxBlobBytes: 0,
    flags: [] as string[],
  };
  return {
    ...repo,
    drivers: repo.drivers ?? [],
    blockers: repo.blockers ?? [],
    contributions: repo.contributions ?? [],
    signals: {
      ...s,
      ciConclusions: s.ciConclusions ?? [],
      ownerCommitShare: s.ownerCommitShare ?? null,
      languages: s.languages ?? [],
      topics: s.topics ?? [],
      fitness: {
        ...fitness,
        flags: fitness.flags ?? [],
      },
    },
  };
}

export function loadLatestReport(
  config: RuroConfig,
  cwd = process.cwd(),
): RuroReport {
  const path = resolve(cwd, config.render.data_path);
  if (!existsSync(path)) {
    throw new Error(`No scorecard data at ${path}. Run \`ruro scan\` first.`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as RuroReport;
  if (parsed?.schema_version !== 1 || !Array.isArray(parsed.repos)) {
    throw new Error(`Invalid scorecard data at ${path}`);
  }
  return normalizeReport(parsed);
}

export function findRepo(report: RuroReport, query: string): ScoredRepo {
  const q = query.toLowerCase();
  const repo = report.repos.find(
    (r) =>
      r.signals.name.toLowerCase() === q ||
      r.signals.fullName.toLowerCase() === q ||
      r.signals.fullName.toLowerCase().endsWith(`/${q}`),
  );
  if (!repo) {
    throw new Error(`Repo not found in latest scorecard: ${query}`);
  }
  return repo;
}
