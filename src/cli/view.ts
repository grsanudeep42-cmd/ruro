import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RuroConfig } from "../config.js";
import type { RuroReport, ScoredRepo } from "../types.js";

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
  return parsed;
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
