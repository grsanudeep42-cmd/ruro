import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { RuroConfig } from "./config.js";
import { collectRepoSignals, createClients } from "./github/collect.js";
import { computeTransitions } from "./history/transitions.js";
import { probeAll } from "./probes/demo.js";
import { syncProfileReadme } from "./profile/sync.js";
import { buildReport, renderDashboard } from "./render/dashboard.js";
import {
  renderProfileSnippet,
  renderProfileSvg,
} from "./render/profile.js";
import { scoreAll } from "./score/score.js";
import type { RuroReport } from "./types.js";

export interface RunOptions {
  token: string;
  config: RuroConfig;
  cwd?: string;
  dryRun?: boolean;
  syncProfile?: boolean;
}

export interface RunResult {
  report: RuroReport;
  dashboardMarkdown: string;
  dashboardPath: string;
  dataPath: string;
  profileSnippetPath: string;
  profileSvgPath: string;
  profileSynced: boolean;
}

function loadPreviousReport(dataPath: string): RuroReport | null {
  if (!existsSync(dataPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(dataPath, "utf8")) as RuroReport;
    if (parsed?.schema_version !== 1 || !Array.isArray(parsed.repos)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function runRuro(options: RunOptions): Promise<RunResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const dataPath = resolve(cwd, options.config.render.data_path);
  const previous = loadPreviousReport(dataPath);

  const clients = createClients(options.token);
  const { included, excludedCount } = await collectRepoSignals(
    clients,
    options.config,
  );

  const probes = await probeAll(
    included.map((r) => r.homepageUrl),
    options.config,
  );
  included.forEach((repo, i) => {
    repo.demo = probes[i];
  });

  const scored = scoreAll(included, options.config);
  const draft = buildReport(options.config, scored, excludedCount, []);
  const transitions = computeTransitions(previous, draft);
  const report: RuroReport = { ...draft, transitions };
  const dashboardMarkdown = renderDashboard(report, options.config);
  const profileSnippet = renderProfileSnippet(report, options.config);
  const profileSvg = renderProfileSvg(report, options.config);

  const dashboardPath = resolve(cwd, options.config.render.dashboard_path);
  const profileSnippetPath = resolve(
    cwd,
    options.config.render.profile_snippet_path,
  );
  const profileSvgPath = resolve(cwd, options.config.render.profile_svg_path);

  let profileSynced = false;

  if (!options.dryRun) {
    mkdirSync(dirname(dashboardPath), { recursive: true });
    mkdirSync(dirname(dataPath), { recursive: true });
    mkdirSync(dirname(profileSnippetPath), { recursive: true });
    mkdirSync(dirname(profileSvgPath), { recursive: true });
    writeFileSync(dashboardPath, dashboardMarkdown, "utf8");
    writeFileSync(dataPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    writeFileSync(profileSnippetPath, profileSnippet, "utf8");
    writeFileSync(profileSvgPath, profileSvg, "utf8");

    if (options.config.render.history) {
      const day = report.generated_at.slice(0, 10);
      const historyPath = resolve(
        cwd,
        join(options.config.render.history_dir, `${day}.json`),
      );
      mkdirSync(dirname(historyPath), { recursive: true });
      writeFileSync(historyPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }

    const shouldSync = options.syncProfile ?? options.config.profile.enabled;
    if (shouldSync && options.config.profile.enabled) {
      const sync = await syncProfileReadme(
        options.token,
        options.config,
        profileSnippet,
      );
      profileSynced = sync.updated;
    }
  }

  return {
    report,
    dashboardMarkdown,
    dashboardPath,
    dataPath,
    profileSnippetPath,
    profileSvgPath,
    profileSynced,
  };
}
