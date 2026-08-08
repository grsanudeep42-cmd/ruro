import * as core from "@actions/core";
import * as github from "@actions/github";
import { loadConfig } from "./config.js";
import { runRuro } from "./run.js";

async function main(): Promise<void> {
  const token = core.getInput("token", { required: true });
  const configPath = core.getInput("config-path") || "ruro.yml";
  const ownerInput = core.getInput("owner") || undefined;
  const dryRun = core.getBooleanInput("dry-run");

  const owner =
    ownerInput ||
    undefined;

  let config = loadConfig(configPath, owner);
  if (!config.owner) {
    config = {
      ...config,
      owner: github.context.repo.owner,
    };
  }

  core.info(`Ruro scanning owner=${config.owner} dryRun=${dryRun}`);
  const result = await runRuro({ token, config, dryRun });

  core.setOutput("repo-count", String(result.report.included_count));
  core.setOutput("dashboard-path", result.dashboardPath);
  core.info(
    `Scored ${result.report.included_count} repos → ${result.dashboardPath}`,
  );
}

main().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
