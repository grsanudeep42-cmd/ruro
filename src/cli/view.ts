import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RuroConfig } from "../config.js";
import { explainCode, explainScoreLine } from "../score/explain.js";
import type { RuroReport, ScoredRepo } from "../types.js";

const W = 72;


function line(ch = "─"): string {
  return ch.repeat(W);
}

function boxTitle(title: string): void {
  console.log(`┌${line("─")}┐`);
  const pad = Math.max(0, W - title.length - 2);
  console.log(`│ ${title}${" ".repeat(pad)}│`);
  console.log(`├${line("─")}┤`);
}

function boxEnd(): void {
  console.log(`└${line("─")}┘`);
}

function row(label: string, value: string): void {
  const l = label.padEnd(14, " ");
  const max = W - 18;
  const v =
    value.length > max ? `${value.slice(0, max - 1)}…` : value;
  console.log(`│ ${l} ${v.padEnd(max, " ")} │`);
}

function section(title: string): void {
  console.log(`│ ${title.padEnd(W - 2, " ")}│`);
  console.log(`├${line("─")}┤`);
}

function wrapBlock(text: string, prefix = "│   "): void {
  const width = W - prefix.length - 1;
  const words = text.split(/\s+/);
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= width) cur += ` ${w}`;
    else {
      console.log(`${prefix}${cur.padEnd(width, " ")}│`);
      cur = w;
    }
  }
  if (cur) console.log(`${prefix}${cur.padEnd(width, " ")}│`);
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

function deployLabel(repo: ScoredRepo): string {
  const d = repo.signals.demo;
  if (d.verified) return `VERIFIED ${d.latencyMs ?? "—"}ms`;
  if (d.status === "NONE") return "NONE";
  return `${d.status}${d.error ? ` (${d.error})` : ""}`;
}

export function printView(report: RuroReport): void {
  boxTitle(`RURO FLEET  ·  ${report.owner}  ·  ${report.generated_at.slice(0, 19)}`);
  row(
    "inventory",
    `${report.included_count}/${report.repo_count} included · ${report.excluded_count} excluded`,
  );
  row(
    "mix",
    Object.entries(report.status_counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}:${n}`)
      .join(" ") || "—",
  );
  row(
    "verified",
    String(report.repos.filter((r) => r.signals.demo.verified).length),
  );
  section("RANK  REPO                      ST       SC  FIT  DEPLOY       STACK");
  report.repos.forEach((repo, i) => {
    const rank = String(i + 1).padStart(2, " ");
    const name = repo.signals.name.padEnd(24, " ").slice(0, 24);
    const stCell = repo.status.padEnd(8, " ").slice(0, 8);
    const sc = String(repo.score).padStart(3, " ");
    const fit = String(repo.signals.fitness?.score ?? 0).padStart(3, " ");
    const dep = (repo.signals.demo.verified
      ? "VERIFIED"
      : repo.signals.demo.status
    )
      .padEnd(12, " ")
      .slice(0, 12);
    const stack = (repo.signals.primaryLanguage ?? "—")
      .padEnd(8, " ")
      .slice(0, 8);
    console.log(
      `│ ${rank}   ${name} ${stCell} ${sc}  ${fit}  ${dep} ${stack} │`,
    );
  });
  section("HINT");
  wrapBlock(
    "ruro status <repo>  — full dossier   ·  ruro why <repo> — score math   ·  ruro review <repo> — Copilot code audit",
  );
  boxEnd();
}

export function printTop(report: RuroReport, n: number): void {
  const top = report.repos.slice(0, Math.max(1, n));
  boxTitle(`RURO TOP ${top.length}  ·  ${report.owner}`);
  top.forEach((repo, i) => {
    section(`${i + 1}. ${repo.signals.fullName}`);
    row("status", `${repo.status} · score ${repo.score}`);
    row("pillars", `Q${repo.pillars.quality} A${repo.pillars.alive} S${repo.pillars.structure}`);
    row("deploy", deployLabel(repo));
    row(
      "fitness",
      `${repo.signals.fitness.score} · ${repo.signals.fitness.sourceFiles} src · ${repo.signals.fitness.testFiles} test · flags ${repo.signals.fitness.flags.join(",") || "—"}`,
    );
    row("drivers", repo.drivers.join(", ") || "—");
    row("blockers", repo.blockers.join(", ") || "—");
  });
  boxEnd();
}

export function printStatus(report: RuroReport, query: string): void {
  const repo = findRepo(report, query);
  const s = repo.signals;
  boxTitle(`RURO STATUS  ·  ${repo.signals.fullName}`);
  row("url", s.url);
  row("private", String(s.isPrivate));
  row("status", repo.status);
  row("score", String(repo.score));
  row(
    "pillars",
    `quality=${repo.pillars.quality}  alive=${repo.pillars.alive}  structure=${repo.pillars.structure}`,
  );
  section("DEPLOY PROBE");
  row("status", s.demo.status);
  row("verified", String(s.demo.verified));
  row("url", s.demo.url ?? "—");
  row("final", s.demo.finalUrl ?? "—");
  row("http", String(s.demo.httpStatus ?? "—"));
  row("latency", s.demo.latencyMs != null ? `${s.demo.latencyMs}ms` : "—");
  row("bytes", String(s.demo.proofBytes ?? "—"));
  row("type", s.demo.contentType ?? "—");
  row("error", s.demo.error ?? "—");
  section("CODE FITNESS (no AI)");
  row("score", String(s.fitness.score));
  row("source", String(s.fitness.sourceFiles));
  row("tests", String(s.fitness.testFiles));
  row("other", String(s.fitness.otherFiles));
  row("max_blob", String(s.fitness.maxBlobBytes));
  row("flags", s.fitness.flags.join(", ") || "—");
  section("PLATFORM SIGNALS");
  row("language", s.primaryLanguage ?? "—");
  row("languages", s.languages.join(", ") || "—");
  row("topics", s.topics.join(", ") || "—");
  row("license", s.licenseSpdx ?? (s.hasLicenseFile ? "file" : "—"));
  row("readme_b", String(s.readmeBytes ?? "—"));
  row("disk_kb", String(s.diskUsageKb));
  row("pushed", s.pushedAt ?? "—");
  row("commits30", String(s.commitsLast30Days));
  row("commits90", String(s.commitsLast90Days));
  row("tests?", `${s.hasTestsHeuristic}/${s.hasTestScript}`);
  row("ci", `${s.hasWorkflows} · last=${s.recentWorkflowConclusion ?? "—"} age=${s.recentWorkflowAgeDays ?? "—"}d`);
  row("manifest", String(s.hasPackageManifest));
  row("lockfile", String(s.hasLockfile));
  row("lint", String(s.hasLintConfigHeuristic));
  row("src/", String(s.hasSrcLayout));
  row("container", String(s.hasContainerfile));
  row("releases", String(s.releasesCount));
  section("DRIVERS");
  for (const d of repo.drivers) {
    wrapBlock(`+ ${d} — ${explainCode(d)}`);
  }
  section("BLOCKERS");
  if (!repo.blockers.length) wrapBlock("(none)");
  for (const b of repo.blockers) {
    wrapBlock(`- ${b} — ${explainCode(b)}`);
  }
  boxEnd();
}

export function printWhy(
  report: RuroReport,
  config: RuroConfig,
  query: string,
): void {
  const repo = findRepo(report, query);
  boxTitle(`RURO WHY  ·  ${repo.signals.fullName}`);
  section("FORMULA");
  for (const l of explainScoreLine(repo.score, repo.pillars, config.weights)) {
    wrapBlock(l);
  }
  section("STATUS RULE");
  wrapBlock(
    "LIVE requires a verified deploy probe (SPA shells count; github.com/repo does not). ACTIVE = recent push without verified deploy. STALE/DORMANT/DEAD by push age. ARCHIVED if archived.",
  );
  wrapBlock(`derived_status=${repo.status}`);
  section("WHAT RAISED THE SCORE");
  for (const d of repo.drivers) wrapBlock(`+ ${d}: ${explainCode(d)}`);
  section("WHAT HURT THE SCORE");
  if (!repo.blockers.length) wrapBlock("(none)");
  for (const b of repo.blockers) wrapBlock(`- ${b}: ${explainCode(b)}`);
  section("HONEST LIMIT");
  wrapBlock(
    "Scores are deterministic signals — not a human judgment of product quality. Use `ruro review` for Copilot code audit (optional, never moves the score).",
  );
  boxEnd();
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
    boxTitle("RURO REVIEW");
    wrapBlock(
      "No Copilot audits cached. Run: GITHUB_TOKEN=$(gh auth token) ruro review <repo>",
    );
    boxEnd();
    return;
  }
  const q = filter?.toLowerCase();
  const items = q
    ? cache.repos.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.fullName.toLowerCase().endsWith(`/${q}`),
      )
    : cache.repos;
  if (!items.length) throw new Error(`No review for: ${filter}`);

  boxTitle(`RURO REVIEW CACHE  ·  ${cache.status}`);
  if (cache.note) wrapBlock(cache.note);
  for (const r of items) {
    section(r.fullName);
    row("audit", r.status);
    wrapBlock(`why: ${r.why_showable || "—"}`);
    wrapBlock(`strengths: ${r.strengths.join(" | ") || "—"}`);
    wrapBlock(`weaknesses: ${r.weaknesses.join(" | ") || "—"}`);
    console.log(`│${" ".repeat(W)}│`);
    for (const line of (r.review || "—").split("\n")) {
      wrapBlock(line);
    }
    if (r.error) wrapBlock(`error: ${r.error}`);
  }
  boxEnd();
}
