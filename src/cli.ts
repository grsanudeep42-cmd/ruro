#!/usr/bin/env node
import { loadConfig, defaultConfig } from "./config.js";
import { runRuro } from "./run.js";

function usage(): never {
  console.log(`Ruro — GitHub portfolio scorecard (zero AI)

Usage:
  ruro [--config ruro.yml] [--owner LOGIN] [--token TOKEN] [--dry-run] [--sync-profile]

Env:
  GITHUB_TOKEN / GH_TOKEN   required unless --token is set
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) usage();

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

  const config = (() => {
    try {
      return loadConfig(configPath, owner);
    } catch {
      if (!owner) {
        console.error(`Config missing at ${configPath}; pass --owner.`);
        process.exit(1);
      }
      return defaultConfig(owner);
    }
  })();

  const result = await runRuro({ token, config, dryRun, syncProfile });
  console.log(
    `Ruro: ${result.report.included_count} repos scored. Dashboard → ${result.dashboardPath}`,
  );
  if (result.report.repos[0]) {
    const top = result.report.repos[0];
    console.log(
      `Top: ${top.signals.fullName} (${top.status}, score ${top.score})`,
    );
  }
  if (result.profileSynced) {
    console.log(`Profile synced → ${config.profile.repo}/${config.profile.readme_path}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
