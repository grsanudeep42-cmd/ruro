import * as core from "@actions/core";
import * as github from "@actions/github";
import { loadConfig } from "./config.js";
import { runRuro } from "./run.js";

async function main(): Promise<void> {
  const token = core.getInput("token", { required: true });
  const configPath = core.getInput("config-path") || "ruro.yml";
  const ownerInput = core.getInput("owner") || undefined;
  const dryRun = core.getBooleanInput("dry-run");
  const syncProfileInput = core.getInput("sync-profile");
  const syncProfile =
    syncProfileInput === "" ? undefined : syncProfileInput === "true";

  let config = loadConfig(configPath, ownerInput);
  if (!config.owner) {
    config = {
      ...config,
      owner: github.context.repo.owner,
    };
  }

  core.info(
    `Ruro scanning owner=${config.owner} dryRun=${dryRun} syncProfile=${syncProfile ?? config.profile.enabled}`,
  );
  const result = await runRuro({ token, config, dryRun, syncProfile });

  core.setOutput("repo-count", String(result.report.included_count));
  core.setOutput("dashboard-path", result.dashboardPath);
  core.setOutput("profile-synced", String(result.profileSynced));
  core.info(
    `Scored ${result.report.included_count} repos → ${result.dashboardPath}`,
  );
  if (result.profileSynced) {
    core.info(`Profile README synced for ${config.profile.repo}`);
  }
}

main().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
