import type { RuroConfig } from "../config.js";
import {
  explainCode,
  explainContribution,
  explainScoreLine,
} from "../score/explain.js";
import type { RuroReport, ScoredRepo } from "../types.js";
import { agent, c, item, note, say } from "./tui.js";

function deployLabel(repo: ScoredRepo): string {
  const d = repo.signals.demo;
  if (d.verified) return `verified live (${d.latencyMs ?? "—"}ms)`;
  if (d.status === "NONE") return "no deploy url";
  return `unproven (${d.status}${d.error ? `: ${d.error}` : ""})`;
}

function oneLiner(r: ScoredRepo, i: number): string {
  return `${c("mute", String(i + 1).padStart(2))}  ${c("bold", r.signals.name)}  ${r.status}  ${c("lime", String(r.score))}  ${c("mute", deployLabel(r))}`;
}

export function narrateView(report: RuroReport): void {
  const live = report.repos.filter((r) => r.signals.demo.verified);
  const lead = report.repos[0];
  agent(
    [
      `${report.owner} fleet — ${report.included_count} in scope, ${live.length} verified live.`,
      lead
        ? `Lead: ${lead.signals.name} · ${lead.status} · ${lead.score}.`
        : "Nothing scored yet — run scan.",
    ].join("\n"),
  );

  for (const [i, r] of report.repos.slice(0, 10).entries()) {
    say(oneLiner(r, i));
  }
  if (report.repos.length > 10) {
    note(`+${report.repos.length - 10} more — try “top 15”`);
  }
  note("name a repo for a dossier · why <repo> for score math");
  console.log("");
}

export function narrateTop(report: RuroReport, n: number): void {
  const top = report.repos.slice(0, Math.max(1, n));
  agent(`Top ${top.length} by showability.`);
  for (const [i, r] of top.entries()) {
    const up = r.drivers.slice(0, 3).join(", ") || "—";
    const down = r.blockers.slice(0, 3).join(", ") || "—";
    say(`${c("lime", `${i + 1}.`)} ${c("bold", r.signals.name)}  ${r.status} ${r.score}`);
    note(
      `Q${r.pillars.quality} A${r.pillars.alive} S${r.pillars.structure} · ${deployLabel(r)} · fit ${r.signals.fitness.score}`,
    );
    note(`↑ ${up}`);
    note(`↓ ${down}`);
    console.log("");
  }
}

/** Short agent dossier — not a boxed form. */
export function narrateStatus(report: RuroReport, query: string): void {
  const repo = findIn(report, query);
  const s = repo.signals;
  const demo = s.demo.verified
    ? `Deploy verified at ${s.demo.url} (${s.demo.latencyMs ?? "—"}ms).`
    : s.demo.status === "NONE"
      ? "No deploy URL on file."
      : `Deploy unproven (${s.demo.status}${s.demo.error ? `: ${s.demo.error}` : ""}).`;

  agent(
    [
      `${repo.signals.fullName}`,
      `${repo.status} · score ${repo.score} · Q${repo.pillars.quality} A${repo.pillars.alive} S${repo.pillars.structure}`,
      demo,
      `Code tree: ${s.fitness.sourceFiles} source · ${s.fitness.testFiles} tests · fitness ${s.fitness.score}. Stack: ${s.primaryLanguage ?? "—"}.`,
      `Cadence: last push ${s.pushedAt?.slice(0, 10) ?? "—"} · ${s.commitsLast30Days} commits/30d · ${s.hasWorkflows ? "CI present" : "no CI"}.`,
    ].join("\n"),
  );

  if (repo.drivers.length) {
    note("raised");
    for (const d of repo.drivers.slice(0, 5)) item(`${d}`);
  }
  if (repo.blockers.length) {
    note("hurt");
    for (const b of repo.blockers.slice(0, 5)) item(`${b}`);
  }
  note(`why ${s.name} · review ${s.name} · full ${s.name}`);
  console.log("");
}

/** Long form when user asks “full <repo>”. */
export function narrateFull(report: RuroReport, query: string): void {
  const repo = findIn(report, query);
  const s = repo.signals;
  narrateStatus(report, query);

  agent(`Detail — ${s.name}`);
  say(`${c("mute", "url")}     ${s.url}`);
  say(
    `${c("mute", "probe")}   ${s.demo.status}${s.demo.verified ? " VERIFIED" : ""} · ${s.demo.httpStatus ?? "—"} · ${s.demo.latencyMs ?? "—"}ms · ${s.demo.proofBytes ?? "—"}B`,
  );
  say(`${c("mute", "demo")}    ${s.demo.url ?? "—"}`);
  say(
    `${c("mute", "flags")}   ${s.fitness.flags.join(", ") || "—"}`,
  );
  say(
    `${c("mute", "langs")}   ${(s.languages || []).join(", ") || "—"}`,
  );
  say(
    `${c("mute", "readme")}  ${s.readmeBytes ?? 0}B · license ${s.licenseSpdx ?? (s.hasLicenseFile ? "file" : "none")}`,
  );
  console.log("");
  note("raised (explained)");
  for (const d of repo.drivers) item(`${d} — ${explainCode(d)}`);
  note("hurt (explained)");
  if (!repo.blockers.length) item("(nothing major)");
  for (const b of repo.blockers) item(`${b} — ${explainCode(b)}`);
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
  note(
    "LIVE = verified deploy AND push within active_days. Scores are signals — not taste.",
  );
  console.log("");
  note("contributions");
  const contribs = [...(repo.contributions ?? [])].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
  );
  for (const row of contribs.filter((x) => x.delta !== 0).slice(0, 16)) {
    item(explainContribution(row));
  }
  console.log("");
  note("raised");
  for (const d of repo.drivers) item(`${d}: ${explainCode(d)}`);
  note("hurt");
  if (!repo.blockers.length) item("(none)");
  for (const b of repo.blockers) item(`${b}: ${explainCode(b)}`);
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
    agent('No Copilot audit yet. Say “review <repo>” (needs GITHUB_TOKEN).');
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
      note("This is not a successful review. Retry review <repo>.");
      console.log("");
      continue;
    }
    agent(`Audit · ${r.fullName} · judgment (not score)`);
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

/** Lightweight intent parse for agent chat. */
export function parseIntent(line: string): {
  kind:
    | "view"
    | "top"
    | "status"
    | "full"
    | "why"
    | "review"
    | "scan"
    | "reload"
    | "help"
    | "exit"
    | "clear"
    | "unknown";
  arg?: string;
  n?: number;
} {
  const raw = line.trim();
  const lower = raw.toLowerCase();

  if (!raw) return { kind: "unknown" };
  if (/^(exit|quit|q|\/exit|\/quit)$/i.test(raw)) return { kind: "exit" };
  if (/^(help|\?|\/help)$/i.test(raw)) return { kind: "help" };
  if (/^(clear|\/clear)$/i.test(raw)) return { kind: "clear" };
  if (/^(reload|\/reload)$/i.test(raw)) return { kind: "reload" };

  const slash = raw.match(
    /^\/(view|top|status|full|why|review|scan|explain)\s*(.*)$/i,
  );
  if (slash) {
    const cmd = slash[1].toLowerCase();
    const rest = slash[2].trim();
    if (cmd === "view") return { kind: "view" };
    if (cmd === "scan") return { kind: "scan" };
    if (cmd === "top") {
      const n = rest ? Number.parseInt(rest, 10) : 5;
      return { kind: "top", n: Number.isFinite(n) ? n : 5 };
    }
    if (cmd === "status") return { kind: "status", arg: rest || undefined };
    if (cmd === "full") return { kind: "full", arg: rest || undefined };
    if (cmd === "why" || cmd === "explain")
      return { kind: "why", arg: rest || undefined };
    if (cmd === "review") return { kind: "review", arg: rest || undefined };
  }

  if (/^(view|fleet|list|show(\s+fleet)?)$/i.test(lower)) return { kind: "view" };
  if (/^scan$/i.test(lower) || /refresh|rescan/.test(lower))
    return { kind: "scan" };

  const topM = lower.match(/^top\s*(\d+)?$/);
  if (topM) {
    return { kind: "top", n: topM[1] ? Number.parseInt(topM[1], 10) : 5 };
  }

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

  // bare repo name → short status
  if (/^[\w.-]+$/.test(raw) && raw.length > 1) {
    return { kind: "status", arg: raw };
  }

  return { kind: "unknown" };
}
