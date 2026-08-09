#!/usr/bin/env node
import { loadConfig, defaultConfig } from "./config.js";
import { annotateWithCopilot, readAiCache } from "./ai/copilot.js";
import { printBanner } from "./cli/banner.js";
import {
  narrateBrief,
  narrateDiff,
  narrateFull,
  narrateNext,
  narrateReview,
  narrateStatus,
  narrateTop,
  narrateView,
  narrateWhy,
} from "./cli/narrate.js";
import { startRepl } from "./cli/repl.js";
import { agent, tool } from "./cli/tui.js";
import { findRepo, loadLatestReport } from "./cli/view.js";
import { explainCode, explainScoreLine } from "./score/explain.js";
import { runRuro } from "./run.js";
import type { RuroReport, ScoredRepo } from "./types.js";

function usage(code = 1): never {
  printBanner("help");
  console.log(`
  ruro                         live agent session (Ruri)
  ruro repl|live|shell         same
  ruro scan                    refresh truth (needs token)
  ruro brief | next | diff     operator surfaces
  ruro view | top [n]          fleet / shortlist
  ruro status <repo>           dossier + deploy proof
  ruro full <repo>             long dossier
  ruro why <repo>              contributions + playbook
  ruro review [repo]           Copilot garnish (optional)
  ruro help                    this help
  ruro --json <cmd> …          machine output

Live:
  $ npm run ruro
  › brief
  › why phantom
  › /exit

Env: GITHUB_TOKEN or GH_TOKEN for scan & review
`);
  process.exit(code);
}

function takeFlag(args: string[], flag: string): boolean {
  const i = args.indexOf(flag);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

function parseConfigPath(args: string[]): { configPath: string; rest: string[] } {
  let configPath = "ruro.yml";
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--config") configPath = args[++i];
    else rest.push(args[i]);
  }
  return { configPath, rest };
}

function loadCfg(configPath: string, owner?: string) {
  try {
    return loadConfig(configPath, owner);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const missing = /Config not found:/i.test(msg);
    if (missing && owner) {
      return defaultConfig(owner);
    }
    if (missing) {
      console.error(`Config missing at ${configPath}; pass --owner.`);
      process.exit(1);
    }
    // Invalid YAML / Zod — never silently ignore a broken ruro.yml
    console.error(msg);
    process.exit(1);
  }
}

function emitJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function whyPayload(repo: ScoredRepo, config: ReturnType<typeof loadCfg>) {
  return {
    fullName: repo.signals.fullName,
    score: repo.score,
    status: repo.status,
    pillars: repo.pillars,
    weights: config.weights,
    formula: explainScoreLine(repo.score, repo.pillars, config.weights),
    contributions: repo.contributions ?? [],
    drivers: repo.drivers.map((d) => ({ code: d, explain: explainCode(d) })),
    blockers: repo.blockers.map((b) => ({ code: b, explain: explainCode(b) })),
  };
}

async function runScan(args: string[], asJson: boolean): Promise<void> {
  let configPath = "ruro.yml";
  let owner: string | undefined;
  let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
  let dryRun = false;
  let syncProfile: boolean | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--config") configPath = args[++i];
    else if (a === "--owner") owner = args[++i];
    else if (a === "--token") token = args[++i];
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--sync-profile") syncProfile = true;
    else if (a === "--no-sync-profile") syncProfile = false;
    else if (a === "--json") continue;
    else {
      console.error(`Unknown arg: ${a}`);
      usage();
    }
  }

  if (!token) {
    console.error("Missing token. Set GITHUB_TOKEN or pass --token.");
    process.exit(1);
  }

  if (!asJson) {
    printBanner("scan");
    tool("scanning GitHub + probes + fitness…");
  }
  const config = loadCfg(configPath, owner);
  const result = await runRuro({ token, config, dryRun, syncProfile });
  if (asJson) {
    emitJson({
      ok: true,
      included: result.report.included_count,
      lead: result.report.repos[0]?.signals.fullName ?? null,
      dashboardPath: result.dashboardPath,
      webPath: result.webPath,
      generated_at: result.report.generated_at,
    });
    return;
  }
  agent(
    `Done · ${result.report.included_count} scored · lead ${result.report.repos[0]?.signals.name ?? "—"}`,
  );
}

async function runReview(args: string[], asJson: boolean): Promise<void> {
  let configPath = "ruro.yml";
  let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
  let query: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--config") configPath = args[++i];
    else if (a === "--token") token = args[++i];
    else if (a === "--force" || a === "--json") continue;
    else if (a.startsWith("-")) {
      console.error(`Unknown arg: ${a}`);
      usage();
    } else query = a;
  }

  if (!token) {
    console.error("Missing token. Set GITHUB_TOKEN or pass --token.");
    process.exit(1);
  }

  const config = loadCfg(configPath);
  const report = loadLatestReport(config);
  const aiConfig = {
    ...config,
    ai: {
      ...config.ai,
      enabled: true,
      provider: "copilot" as const,
      top_n: query ? 1 : config.ai.top_n,
    },
  };
  const scoped = query
    ? { ...report, repos: [findRepo(report, query)] }
    : { ...report, repos: report.repos.slice(0, config.ai.top_n) };

  if (!asJson) {
    printBanner(`review ${query ?? "top"}`);
    tool(`auditing ${query ?? "top"} with Copilot…`);
  }
  const result = await annotateWithCopilot({
    report: scoped,
    config: aiConfig,
    cwd: process.cwd(),
    token,
  });
  const cache = readAiCache(process.cwd(), config.ai.cache_dir);
  if (asJson) {
    emitJson({
      ok: !result.skipped,
      skipped: result.skipped,
      reason: result.reason,
      annotated: result.annotated,
      cache,
    });
    return;
  }
  if (result.skipped) {
    agent(`Audit skipped — ${result.reason ?? "unknown"}`);
  } else {
    agent(`Audit stored (${result.annotated}).`);
  }
  narrateReview(cache, query);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help") || argv[0] === "help") {
    usage(0);
  }

  const asJson = takeFlag(argv, "--json");

  // No args / repl / shell → LIVE session (stays open) — not with --json
  if (
    argv.length === 0 ||
    argv[0] === "repl" ||
    argv[0] === "shell" ||
    argv[0] === "live"
  ) {
    if (asJson) {
      console.error("--json cannot start an interactive session");
      process.exit(1);
    }
    let configPath = "ruro.yml";
    const rest =
      argv[0] && ["repl", "shell", "live"].includes(argv[0])
        ? argv.slice(1)
        : argv;
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === "--config") configPath = rest[++i];
    }
    const config = loadCfg(configPath);
    await startRepl({ config });
    return;
  }

  const cmd = argv[0];
  const isSub = [
    "scan",
    "view",
    "top",
    "status",
    "full",
    "why",
    "review",
    "explain",
    "brief",
    "next",
    "diff",
  ].includes(cmd);

  if (!isSub) {
    console.error(`Unknown command: ${cmd}`);
    usage(1);
  }

  const subArgs = argv.slice(1);
  if (cmd === "scan") {
    await runScan(subArgs, asJson);
    return;
  }
  if (cmd === "review") {
    await runReview(subArgs, asJson);
    return;
  }

  const { configPath, rest } = parseConfigPath(subArgs);
  const config = loadCfg(configPath);
  const report = loadLatestReport(config);

  if (cmd === "view") {
    if (asJson) {
      emitJson(summarizeReport(report));
      return;
    }
    narrateView(report);
    return;
  }
  if (cmd === "brief") {
    if (asJson) {
      emitJson({
        owner: report.owner,
        regressions: report.regressions ?? [],
        top: report.repos.slice(0, 5).map(summarizeRepo),
      });
      return;
    }
    narrateBrief(report, config);
    return;
  }
  if (cmd === "next") {
    if (asJson) {
      emitJson({
        actions: report.repos.flatMap((r) =>
          r.blockers.slice(0, 2).map((b) => ({
            repo: r.signals.name,
            blocker: b,
          })),
        ).slice(0, 10),
      });
      return;
    }
    narrateNext(report);
    return;
  }
  if (cmd === "diff") {
    if (asJson) {
      emitJson({
        transitions: report.transitions,
        regressions: report.regressions ?? [],
      });
      return;
    }
    narrateDiff(report, config);
    return;
  }
  if (cmd === "top") {
    const n = rest[0] ? Number.parseInt(rest[0], 10) : 5;
    if (!Number.isFinite(n) || n < 1) {
      console.error("top expects a positive integer");
      process.exit(1);
    }
    if (asJson) {
      emitJson({
        owner: report.owner,
        top: report.repos.slice(0, n).map(summarizeRepo),
      });
      return;
    }
    narrateTop(report, n);
    return;
  }
  if (cmd === "status" || cmd === "full") {
    const query = rest[0];
    if (!query) {
      console.error(`${cmd} expects a repo name`);
      process.exit(1);
    }
    if (asJson) {
      emitJson(summarizeRepo(findRepo(report, query)));
      return;
    }
    if (cmd === "full") {
      narrateFull(report, query);
      return;
    }
    narrateStatus(report, query);
    return;
  }
  if (cmd === "why" || cmd === "explain") {
    const query = rest[0];
    if (!query) {
      console.error("why expects a repo name");
      process.exit(1);
    }
    const repo = findRepo(report, query);
    if (asJson) {
      emitJson(whyPayload(repo, config));
      return;
    }
    narrateWhy(report, config, query);
  }
}

function summarizeRepo(repo: ScoredRepo) {
  return {
    fullName: repo.signals.fullName,
    name: repo.signals.name,
    status: repo.status,
    score: repo.score,
    pillars: repo.pillars,
    deploy: {
      status: repo.signals.demo.status,
      verified: repo.signals.demo.verified,
      url: repo.signals.demo.url,
      bodyHash: repo.signals.demo.bodyHash ?? null,
      spaShell: repo.signals.demo.spaShell ?? false,
      hashStable: repo.signals.demo.hashStable ?? null,
    },
    fitness: repo.signals.fitness.score,
    ciConclusions: repo.signals.ciConclusions ?? [],
    ownerCommitShare: repo.signals.ownerCommitShare ?? null,
    drivers: repo.drivers,
    blockers: repo.blockers,
    contributions: repo.contributions ?? [],
  };
}

function summarizeReport(report: RuroReport) {
  return {
    owner: report.owner,
    generated_at: report.generated_at,
    included_count: report.included_count,
    excluded_count: report.excluded_count,
    status_counts: report.status_counts,
    verified: report.repos.filter((r) => r.signals.demo.verified).length,
    repos: report.repos.map(summarizeRepo),
  };
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
