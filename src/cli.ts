#!/usr/bin/env node
import { loadConfig, defaultConfig } from "./config.js";
import { annotateWithCopilot, readAiCache } from "./ai/copilot.js";
import { printBanner } from "./cli/banner.js";
import { startRepl } from "./cli/repl.js";
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
  printBanner("help");
  console.log(`
  ruro                      start LIVE agent session (stays open)
  ruro repl                 same
  ruro scan | view | top | status | why | review   one-shot

Live (what you want):
  $ npm run ruro
  › view
  › aryanbloodbank
  › why phantom
  › review aryanbloodbank
  › /exit

Env: GITHUB_TOKEN / GH_TOKEN for scan & review
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

  printBanner("scan");
  console.log("[ruro] scan starting (github + probes + fitness)…");
  const config = loadCfg(configPath, owner);
  const result = await runRuro({ token, config, dryRun, syncProfile });
  console.log(
    `[ruro] scored ${result.report.included_count} → ${result.dashboardPath}`,
  );
  console.log(`[ruro] web → ${result.webPath}`);
  if (result.report.repos[0]) {
    const top = result.report.repos[0];
    console.log(
      `[ruro] lead ${top.signals.fullName} [${top.status}] score=${top.score}`,
    );
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

  printBanner(`review ${query ?? "top"}`);
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
  if (argv.includes("-h") || argv.includes("--help")) usage();

  // No args / repl / shell → LIVE session (stays open)
  if (
    argv.length === 0 ||
    argv[0] === "repl" ||
    argv[0] === "shell" ||
    argv[0] === "live"
  ) {
    let configPath = "ruro.yml";
    const rest = argv[0] && ["repl", "shell", "live"].includes(argv[0])
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
    "why",
    "review",
    "explain",
  ].includes(cmd);

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
    printBanner("view");
    printView(report);
    return;
  }
  if (cmd === "top") {
    const n = rest[0] ? Number.parseInt(rest[0], 10) : 5;
    if (!Number.isFinite(n) || n < 1) {
      console.error("top expects a positive integer");
      process.exit(1);
    }
    printBanner(`top ${n}`);
    printTop(report, n);
    return;
  }
  if (cmd === "status") {
    const query = rest[0];
    if (!query) {
      console.error("status expects a repo name");
      process.exit(1);
    }
    printBanner(`status ${query}`);
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
    printBanner(`why ${query}`);
    printWhy(report, config, query);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
