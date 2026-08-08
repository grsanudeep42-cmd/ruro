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
    throw new Error(
      `No scorecard data at ${path}. Run \`ruro scan\` first.`,
    );
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as RuroReport;
  if (parsed?.schema_version !== 1 || !Array.isArray(parsed.repos)) {
    throw new Error(`Invalid scorecard data at ${path}`);
  }
  return parsed;
}

function pad(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width - 1) + "…";
  return text + " ".repeat(width - text.length);
}

function formatRow(repo: ScoredRepo, rank: number): string {
  const name = pad(repo.signals.name, 22);
  const status = pad(repo.status, 9);
  const score = String(repo.score).padStart(3, " ");
  const lang = pad(repo.signals.primaryLanguage ?? "—", 12);
  const demo = pad(repo.signals.demo.status, 6);
  return `${String(rank).padStart(2, " ")}  ${name}  ${status}  ${score}  ${lang}  ${demo}`;
}

export function printView(report: RuroReport): void {
  const mix = Object.entries(report.status_counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join("  ");
  console.log(`Ruro · ${report.owner} · ${report.generated_at}`);
  console.log(
    `included ${report.included_count}/${report.repo_count}  excluded ${report.excluded_count}`,
  );
  console.log(mix || "no statuses");
  console.log("");
  console.log(" #  repo                    status     sc   stack         demo");
  console.log("--  ----------------------  ---------  ---  ------------  ------");
  report.repos.forEach((repo, i) => {
    console.log(formatRow(repo, i + 1));
  });
}

export function printTop(report: RuroReport, n: number): void {
  const top = report.repos.slice(0, Math.max(1, n));
  console.log(`Top ${top.length} · ${report.owner}`);
  top.forEach((repo, i) => {
    console.log(
      `${i + 1}. ${repo.signals.fullName}  [${repo.status}]  score ${repo.score}`,
    );
    console.log(
      `   drivers: ${repo.drivers.join(", ") || "—"}`,
    );
  });
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

export function printStatus(report: RuroReport, query: string): void {
  const repo = findRepo(report, query);
  console.log(repo.signals.fullName);
  console.log(`url        ${repo.signals.url}`);
  console.log(`status     ${repo.status}`);
  console.log(`score      ${repo.score}`);
  console.log(
    `pillars    quality=${repo.pillars.quality} alive=${repo.pillars.alive} structure=${repo.pillars.structure}`,
  );
  console.log(
    `demo       ${repo.signals.demo.status}${repo.signals.demo.verified ? " VERIFIED" : ""}${repo.signals.demo.url ? ` (${repo.signals.demo.url})` : ""}`,
  );
  console.log(
    `fitness    ${repo.signals.fitness.score} (${repo.signals.fitness.sourceFiles} src / ${repo.signals.fitness.testFiles} test)`,
  );
  console.log(`language   ${repo.signals.primaryLanguage ?? "—"}`);
  console.log(`drivers    ${repo.drivers.join(", ") || "—"}`);
  console.log(`blockers   ${repo.blockers.join(", ") || "—"}`);
}

export function printReviews(
  cache: {
    status: string;
    note?: string;
    repos: Array<{
      fullName: string;
      status: string;
      why_showable: string;
      review: string;
      strengths: string[];
      weaknesses: string[];
      error?: string;
    }>;
  } | null,
  filter?: string,
): void {
  if (!cache || !cache.repos.length) {
    console.log(
      "No Copilot reviews yet. Enable ai in ruro.yml and run `ruro review` (needs Copilot CLI).",
    );
    return;
  }
  console.log(`Copilot reviews · ${cache.status}`);
  if (cache.note) console.log(cache.note);
  console.log("");
  const q = filter?.toLowerCase();
  const items = q
    ? cache.repos.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.fullName.toLowerCase().endsWith(`/${q}`),
      )
    : cache.repos;
  if (!items.length) {
    throw new Error(`No review for: ${filter}`);
  }
  for (const r of items) {
    console.log(`## ${r.fullName} [${r.status}]`);
    console.log(`why: ${r.why_showable || "—"}`);
    console.log(`strengths: ${r.strengths.join(", ") || "—"}`);
    console.log(`weaknesses: ${r.weaknesses.join(", ") || "—"}`);
    console.log(r.review || "—");
    if (r.error) console.log(`error: ${r.error}`);
    console.log("");
  }
}
