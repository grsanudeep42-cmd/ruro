#!/usr/bin/env node
import { loadConfig, defaultConfig } from "./config.js";
import { annotateWithCopilot, readAiCache } from "./ai/copilot.js";
import {
  findRepo,
  loadLatestReport,
  printReviews,
  printStatus,
  printTop,
  printView,
  printWhy,
} from "./cli/view.js";
import { runRuro } from "./run.js";

function usage(): never {
  console.log(`RURO — GitHub OS CLI

  ruro scan [--config ruro.yml] [--owner LOGIN] [--token TOKEN] [--dry-run]
  ruro view [--config ruro.yml]
  ruro top [n] [--config ruro.yml]
  ruro status <repo> [--config ruro.yml]
  ruro why <repo> [--config ruro.yml]
  ruro review [repo] [--config ruro.yml] [--token TOKEN]

Correct flow:
  1) scan     collect signals + verify deploys + tree fitness → data/latest.json
  2) view     fleet table (offline)
  3) status   full dossier for one repo
  4) why      exact score math + explained drivers/blockers
  5) review   Copilot reads cloned source (optional; never moves scores)

Env: GITHUB_TOKEN or GH_TOKEN for scan/review. Copilot CLI on PATH for review.
`);
  process.exit(1);
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
  } catch {
    if (!owner) {
      console.error(`Config missing at ${configPath}; pass --owner.`);
      process.exit(1);
    }
    return defaultConfig(owner);
  }
}

async function runScan(args: string[]): Promise<void> {
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
    else {
      console.error(`Unknown arg: ${a}`);
      usage();
    }
  }

  if (!token) {
    console.error("Missing token. Set GITHUB_TOKEN or pass --token.");
    process.exit(1);
  }

  console.log("[ruro] scan starting (github + probes + fitness)…");
  const config = loadCfg(configPath, owner);
  const result = await runRuro({ token, config, dryRun, syncProfile });
  console.log(
    `[ruro] scored ${result.report.included_count} → ${result.dashboardPath}`,
  );
  console.log(`[ruro] web → ${result.webPath}`);
  console.log(`[ruro] overview → ${config.render.overview_path}`);
  if (result.report.repos[0]) {
    const top = result.report.repos[0];
    console.log(
      `[ruro] lead ${top.signals.fullName} [${top.status}] score=${top.score}`,
    );
  }
  if (result.aiAnnotated > 0) {
    console.log(`[ruro] ai audits → ${result.aiAnnotated}`);
  }
}

async function runReview(args: string[]): Promise<void> {
  let configPath = "ruro.yml";
  let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
  let query: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--config") configPath = args[++i];
    else if (a === "--token") token = args[++i];
    else if (a === "--force") continue;
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

  console.log(
    `[ruro] review ${scoped.repos.map((r) => r.signals.name).join(", ")} (clone + Copilot)…`,
  );
  const result = await annotateWithCopilot({
    report: scoped,
    config: aiConfig,
    cwd: process.cwd(),
    token,
  });
  console.log(
    result.skipped
      ? `[ruro] review skipped: ${result.reason ?? "unknown"}`
      : `[ruro] audited ${result.annotated} → ${config.ai.cache_dir}`,
  );
  printReviews(readAiCache(process.cwd(), config.ai.cache_dir), query);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help") || argv.length === 0) {
    usage();
  }

  const cmd = argv[0];
  const isSub = ["scan", "view", "top", "status", "why", "review", "explain"].includes(
    cmd,
  );

  if (!isSub) {
    await runScan(argv);
    return;
  }

  const subArgs = argv.slice(1);
  if (cmd === "scan") {
    await runScan(subArgs);
    return;
  }
  if (cmd === "review") {
    await runReview(subArgs);
    return;
  }

  const { configPath, rest } = parseConfigPath(subArgs);
  const config = loadCfg(configPath);
  const report = loadLatestReport(config);

  if (cmd === "view") {
    printView(report);
    return;
  }
  if (cmd === "top") {
    const n = rest[0] ? Number.parseInt(rest[0], 10) : 5;
    if (!Number.isFinite(n) || n < 1) {
      console.error("top expects a positive integer");
      process.exit(1);
    }
    printTop(report, n);
    return;
  }
  if (cmd === "status") {
    const query = rest[0];
    if (!query) {
      console.error("status expects a repo name");
      process.exit(1);
    }
    printStatus(report, query);
    printReviews(readAiCache(process.cwd(), config.ai.cache_dir), query);
    return;
  }
  if (cmd === "why" || cmd === "explain") {
    const query = rest[0];
    if (!query) {
      console.error("why expects a repo name");
      process.exit(1);
    }
    printWhy(report, config, query);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
