import type { RuroConfig } from "../config.js";
import {
  computeRegressions,
  loadPreviousHistory,
  topHurts,
} from "../history/regressions.js";
import { playbookFor } from "../ops/playbook.js";
import {
  explainCode,
  explainContribution,
  explainScoreLine,
} from "../score/explain.js";
import type { RuroReport, ScoredRepo } from "../types.js";
import { resolveSlashPrefix } from "./slash.js";
import { agent, c, item, note, say } from "./tui.js";

function deployLabel(repo: ScoredRepo): string {
  const d = repo.signals.demo;
  if (d.verified) {
    const hash = d.bodyHash ? ` · #${d.bodyHash}` : "";
    return `verified (${d.latencyMs ?? "—"}ms${hash})`;
  }
  if (d.status === "NONE") return "no deploy url";
  return `unproven (${d.status}${d.error ? `: ${d.error}` : ""})`;
}

function proofLines(repo: ScoredRepo): string[] {
  const d = repo.signals.demo;
  if (d.status === "NONE" && !d.url) return ["No deploy probe (no homepage)."];
  const lines = [
    `probe ${d.status}${d.verified ? " VERIFIED" : ""} · ${d.httpStatus ?? "—"} · ${d.latencyMs ?? "—"}ms · ${d.proofBytes ?? "—"}B`,
    `final ${d.finalUrl ?? "—"}`,
  ];
  if (d.bodyHash) {
    lines.push(
      `hash ${d.bodyHash}${d.hashStable === true ? " · stable" : d.hashStable === false ? " · unstable" : ""}`,
    );
  }
  if (d.spaShell) lines.push("SPA shell detected (mount + bundles + title)");
  if (d.redirectChain?.length) lines.push(`chain ${d.redirectChain.join(" → ")}`);
  if (d.probedAt) lines.push(`probed ${d.probedAt.slice(0, 19)}`);
  return lines;
}

function oneLiner(r: ScoredRepo, i: number): string {
  return `${c("mute", String(i + 1).padStart(2))}  ${c("bold", r.signals.name)}  ${r.status}  ${c("lime", String(r.score))}  ${c("mute", deployLabel(r))}`;
}

export function narrateView(report: RuroReport): void {
  const live = report.repos.filter((r) => r.status === "LIVE");
  const verified = report.repos.filter((r) => r.signals.demo.verified);
  const lead = report.repos[0];
  agent(
    [
      `${report.owner} fleet — ${report.included_count} in scope · ${live.length} LIVE · ${verified.length} verified deploys.`,
      lead
        ? `Lead: ${lead.signals.name} · ${lead.status} · ${lead.score}.`
        : "Nothing scored yet — run scan.",
    ].join("\n"),
  );

  for (const [i, r] of report.repos.slice(0, 10).entries()) {
    say(oneLiner(r, i));
  }
  if (report.repos.length > 10) {
    note(`+${report.repos.length - 10} more — try “top 15” or /brief`);
  }
  note("brief · next · diff · why <repo> · status <repo>");
  console.log("");
}

export function narrateTop(report: RuroReport, n: number): void {
  const top = report.repos.slice(0, Math.max(1, n));
  agent(`Top ${top.length} by showability.`);
  for (const [i, r] of top.entries()) {
    say(`${c("lime", `${i + 1}.`)} ${c("bold", r.signals.name)}  ${r.status} ${r.score}`);
    note(
      `Q${r.pillars.quality} A${r.pillars.alive} S${r.pillars.structure} · ${deployLabel(r)} · fit ${r.signals.fitness.score}`,
    );
    note(`↑ ${r.drivers.slice(0, 3).map((d) => `${d} (${explainCode(d).slice(0, 40)}…)`).join(" · ") || "—"}`);
    note(`↓ ${r.blockers.slice(0, 3).map((b) => `${b}`).join(", ") || "—"}`);
    console.log("");
  }
}

export function narrateStatus(report: RuroReport, query: string): void {
  const repo = findIn(report, query);
  const s = repo.signals;
  agent(
    [
      `${repo.signals.fullName}`,
      `${repo.status} · score ${repo.score} · Q${repo.pillars.quality} A${repo.pillars.alive} S${repo.pillars.structure}`,
      `Tree: ${s.fitness.sourceFiles} src · ${s.fitness.testFiles} tests · fit ${s.fitness.score} · ${s.primaryLanguage ?? "—"}`,
      `Cadence: push ${s.pushedAt?.slice(0, 10) ?? "—"} · ${s.commitsLast30Days}/30d · owner share ${s.ownerCommitShare ?? "—"}%`,
      `CI: ${(s.ciConclusions ?? []).length ? (s.ciConclusions ?? []).join(",") : s.hasWorkflows ? "workflows" : "none"}`,
    ].join("\n"),
  );

  note("deploy proof");
  for (const line of proofLines(repo)) say(line);

  if (repo.drivers.length) {
    note("raised");
    for (const d of repo.drivers.slice(0, 5)) item(`${d} — ${explainCode(d)}`);
  }
  if (repo.blockers.length) {
    note("hurt → fix");
    for (const b of repo.blockers.slice(0, 5)) {
      item(`${b} — ${playbookFor(b)}`);
    }
  }
  note(`why ${s.name} · full ${s.name} · next`);
  console.log("");
}

export function narrateFull(report: RuroReport, query: string): void {
  const repo = findIn(report, query);
  const s = repo.signals;
  narrateStatus(report, query);

  agent(`Detail — ${s.name}`);
  say(`${c("mute", "url")}     ${s.url}`);
  for (const line of proofLines(repo)) say(line);
  say(`${c("mute", "flags")}   ${s.fitness.flags.join(", ") || "—"}`);
  say(`${c("mute", "langs")}   ${(s.languages || []).join(", ") || "—"}`);
  say(
    `${c("mute", "readme")}  ${s.readmeBytes ?? 0}B · license ${s.licenseSpdx ?? (s.hasLicenseFile ? "file" : "none")}`,
  );
  console.log("");
}

export function narrateWhy(
  report: RuroReport,
  config: RuroConfig,
  query: string,
): void {
  const repo = findIn(report, query);
  agent(`Why ${repo.signals.name} is ${repo.score}`);
  for (const line of explainScoreLine(repo.score, repo.pillars, config.weights)) {
    say(line);
  }
  console.log("");
  note("biggest movers");
  const contribs = [...(repo.contributions ?? [])].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
  );
  for (const row of contribs.filter((x) => x.delta !== 0).slice(0, 10)) {
    item(explainContribution(row));
  }
  console.log("");
  note("hurt → fix");
  if (!repo.blockers.length) item("(none)");
  for (const b of repo.blockers.slice(0, 6)) {
    item(`${b}: ${playbookFor(b)}`);
  }
  console.log("");
}

export function narrateBrief(
  report: RuroReport,
  config: RuroConfig,
  cwd = process.cwd(),
): void {
  const live = report.repos.filter((r) => r.status === "LIVE");
  const verified = report.repos.filter((r) => r.signals.demo.verified);
  const prev =
    loadPreviousHistory(config.render.history_dir, cwd, report.generated_at) ??
    null;
  const regs =
    report.regressions?.length
      ? report.regressions
      : computeRegressions(prev, report);

  agent(
    [
      `Operator brief · ${report.owner}`,
      `${report.included_count} repos · ${live.length} LIVE · ${verified.length} verified deploys · snapshot ${report.generated_at.slice(0, 16)}`,
    ].join("\n"),
  );

  note("show path (top 5)");
  for (const [i, r] of report.repos.slice(0, 5).entries()) {
    item(
      `${r.signals.name} · ${r.status} ${r.score} · ${deployLabel(r)}`,
    );
    void i;
  }

  if (regs.length) {
    note("regressions");
    for (const r of regs.slice(0, 8)) {
      item(`${r.name}: ${r.detail}`);
    }
  } else {
    note("regressions — none vs previous history");
  }

  note("next actions");
  for (const { repo, blocker } of topHurts(report.repos, 5)) {
    item(`${repo.signals.name} · ${blocker} → ${playbookFor(blocker)}`);
  }
  console.log("");
}

export function narrateNext(report: RuroReport): void {
  agent("Next actions — highest-leverage blockers.");
  for (const { repo, blocker } of topHurts(report.repos, 8)) {
    item(`${repo.signals.name} [${repo.status} ${repo.score}]`);
    say(`  ${blocker} — ${explainCode(blocker)}`);
    say(`  → ${playbookFor(blocker)}`);
  }
  console.log("");
}

export function narrateDiff(
  report: RuroReport,
  config: RuroConfig,
  cwd = process.cwd(),
): void {
  const prev = loadPreviousHistory(
    config.render.history_dir,
    cwd,
    report.generated_at,
  );
  const regs =
    report.regressions?.length
      ? report.regressions
      : computeRegressions(prev, report);

  if (!prev && !regs.length) {
    agent("No prior history day to diff. Run scan again tomorrow — or after another scorecard.");
    return;
  }

  agent(
    `Diff vs ${prev ? prev.generated_at.slice(0, 10) : "previous"} · ${regs.length} regressions`,
  );
  if (!regs.length) {
    note("Fleet stable — no status flips, score drops ≥5, or lost verifies.");
    console.log("");
    return;
  }
  for (const r of regs) {
    item(`[${r.kind}] ${r.name}: ${r.detail}`);
  }
  if (report.transitions?.length) {
    note("status transitions");
    for (const t of report.transitions.slice(0, 10)) {
      item(`${t.name}: ${t.from} → ${t.to} (${t.scoreFrom}→${t.scoreTo})`);
    }
  }
  console.log("");
}

export function narrateReview(
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
  if (!cache?.repos.length) {
    agent(
      "No Copilot audit cached. Optional garnish — try brief / why / next first. Or: review <repo>",
    );
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
  if (!items.length) {
    agent(`No audit found for ${filter}.`);
    return;
  }
  for (const r of items) {
    if (r.status !== "ok") {
      agent(
        `Audit · ${r.fullName} · ${r.status} (judgment failed — scores unchanged)`,
      );
      if (r.error) say(c("red", r.error));
      console.log("");
      continue;
    }
    agent(`Audit · ${r.fullName} · judgment only (not score)`);
    note("Copilot commentary — use why/brief for deterministic truth.");
    if (r.why_showable) say(r.why_showable);
    console.log("");
    if (r.strengths.length) {
      note("strengths");
      for (const s of r.strengths) item(s);
    }
    if (r.weaknesses.length) {
      note("weaknesses");
      for (const w of r.weaknesses) item(w);
    }
    console.log("");
    note("review");
    say(r.review || "—");
    console.log("");
  }
}

export function findIn(report: RuroReport, query: string): ScoredRepo {
  const q = query.toLowerCase();
  const repo = report.repos.find(
    (r) =>
      r.signals.name.toLowerCase() === q ||
      r.signals.fullName.toLowerCase() === q ||
      r.signals.fullName.toLowerCase().endsWith(`/${q}`),
  );
  if (!repo) throw new Error(`No repo matching “${query}” in the latest scan.`);
  return repo;
}

function intentFromSlash(
  cmd: string,
  rest: string,
): {
  kind:
    | "view"
    | "top"
    | "status"
    | "full"
    | "why"
    | "review"
    | "scan"
    | "brief"
    | "next"
    | "diff"
    | "reload"
    | "help"
    | "exit"
    | "clear"
    | "menu"
    | "empty"
    | "unknown";
  arg?: string;
  n?: number;
} {
  if (cmd === "view") return { kind: "view" };
  if (cmd === "scan") return { kind: "scan" };
  if (cmd === "brief") return { kind: "brief" };
  if (cmd === "next") return { kind: "next" };
  if (cmd === "diff") return { kind: "diff" };
  if (cmd === "help") return { kind: "help" };
  if (cmd === "exit") return { kind: "exit" };
  if (cmd === "clear") return { kind: "clear" };
  if (cmd === "reload") return { kind: "reload" };
  if (cmd === "top") {
    const n = rest ? Number.parseInt(rest, 10) : 5;
    return { kind: "top", n: Number.isFinite(n) ? n : 5 };
  }
  if (cmd === "status") return { kind: "status", arg: rest || undefined };
  if (cmd === "full") return { kind: "full", arg: rest || undefined };
  if (cmd === "why" || cmd === "explain")
    return { kind: "why", arg: rest || undefined };
  if (cmd === "review") return { kind: "review", arg: rest || undefined };
  return { kind: "unknown" };
}

export function parseIntent(line: string): {
  kind:
    | "view"
    | "top"
    | "status"
    | "full"
    | "why"
    | "review"
    | "scan"
    | "brief"
    | "next"
    | "diff"
    | "reload"
    | "help"
    | "exit"
    | "clear"
    | "menu"
    | "empty"
    | "unknown";
  arg?: string;
  n?: number;
} {
  const raw = line.trim();
  const lower = raw.toLowerCase();

  if (!raw) return { kind: "empty" };
  if (/^(exit|quit|q|\/exit|\/quit)$/i.test(raw)) return { kind: "exit" };
  if (/^(help|\?|\/help)$/i.test(raw)) return { kind: "help" };
  if (/^(clear|\/clear)$/i.test(raw)) return { kind: "clear" };
  if (/^(reload|\/reload)$/i.test(raw)) return { kind: "reload" };

  // Bare "/" → menu. Partial "/br" → unique match runs that command; else filtered menu.
  if (raw === "/") return { kind: "menu" };
  const menuOnly = raw.match(/^\/([a-z]+)$/i);
  if (menuOnly) {
    const partial = menuOnly[1].toLowerCase();
    const resolved = resolveSlashPrefix(partial);
    if (!resolved) return { kind: "menu", arg: partial };
    return intentFromSlash(resolved.cmd, "");
  }

  const slash = raw.match(
    /^\/(view|top|status|full|why|review|scan|explain|brief|next|diff|help|exit|clear|reload)\s*(.*)$/i,
  );
  if (slash) {
    return intentFromSlash(slash[1].toLowerCase(), slash[2].trim());
  }

  if (/^(view|fleet|list|show(\s+fleet)?)$/i.test(lower)) return { kind: "view" };
  if (/^(brief|ops|operator)$/i.test(lower)) return { kind: "brief" };
  if (/^(next|actions|todo)$/i.test(lower)) return { kind: "next" };
  if (/^(diff|regressions?)$/i.test(lower)) return { kind: "diff" };
  if (/^scan$/i.test(lower) || /refresh|rescan/.test(lower))
    return { kind: "scan" };

  const topM = lower.match(/^top\s*(\d+)?$/);
  if (topM) {
    return { kind: "top", n: topM[1] ? Number.parseInt(topM[1], 10) : 5 };
  }

  if (/^(status|inspect)$/i.test(raw)) return { kind: "status" };
  if (/^(full|detail|dossier)$/i.test(raw)) return { kind: "full" };
  if (/^(why|explain)$/i.test(raw)) return { kind: "why" };
  if (/^(review|audit)$/i.test(raw)) return { kind: "review" };

  const fullM = raw.match(/^(?:full|detail|dossier)\s+(.+)$/i);
  if (fullM) return { kind: "full", arg: fullM[1].trim() };

  const statusM = raw.match(
    /^(?:status|inspect|show|tell me about|what about)\s+(.+)$/i,
  );
  if (statusM) return { kind: "status", arg: statusM[1].trim() };

  const whyM = raw.match(/^(?:why|explain)\s+(.+)$/i);
  if (whyM) return { kind: "why", arg: whyM[1].trim() };

  const reviewM = raw.match(/^(?:review|audit)\s+(.+)$/i);
  if (reviewM) return { kind: "review", arg: reviewM[1].trim() };

  if (
    /^[\w.-]+$/.test(raw) &&
    raw.length > 1 &&
    !/^(status|why|review|full|view|top|scan|help|exit|quit|reload|clear|audit|explain|inspect|dossier|detail|brief|next|diff|ops|actions|todo)$/i.test(
      raw,
    )
  ) {
    return { kind: "status", arg: raw };
  }

  return { kind: "unknown" };
}
