#!/usr/bin/env node
import { loadConfig, defaultConfig } from "./config.js";
import {
  loadLatestReport,
  printStatus,
  printTop,
  printView,
} from "./cli/view.js";
import { runRuro } from "./run.js";

function usage(): never {
  console.log(`Ruro — portfolio Jarvis for GitHub (core: zero AI)

Usage:
  ruro [scan] [--config ruro.yml] [--owner LOGIN] [--token TOKEN] [--dry-run] [--sync-profile]
  ruro view [--config ruro.yml]
  ruro top [n] [--config ruro.yml]
  ruro status <repo> [--config ruro.yml]

Env:
  GITHUB_TOKEN / GH_TOKEN   required for scan unless --token is set
`);
  process.exit(1);
}

function parseConfigPath(args: string[]): { configPath: string; rest: string[] } {
  let configPath = "ruro.yml";
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--config") {
      configPath = args[++i];
    } else {
      rest.push(args[i]);
    }
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

  const config = loadCfg(configPath, owner);
  const result = await runRuro({ token, config, dryRun, syncProfile });
  console.log(
    `Ruro: ${result.report.included_count} repos scored. Dashboard → ${result.dashboardPath}`,
  );
  console.log(`Web → ${result.webPath}`);
  if (result.report.repos[0]) {
    const top = result.report.repos[0];
    console.log(
      `Top: ${top.signals.fullName} (${top.status}, score ${top.score})`,
    );
  }
  if (result.profileSynced) {
    console.log(
      `Profile synced → ${config.profile.repo}/${config.profile.readme_path}`,
    );
  }
  if (result.aiAnnotated > 0) {
    console.log(`AI annotations → ${result.aiAnnotated} repos`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) usage();

  const cmd = argv[0];
  const isSub =
    cmd === "scan" ||
    cmd === "view" ||
    cmd === "top" ||
    cmd === "status";

  if (!isSub) {
    await runScan(argv);
    return;
  }

  const subArgs = argv.slice(1);

  if (cmd === "scan") {
    await runScan(subArgs);
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
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
