import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  loadLatestReport,
  printStatus,
  printTop,
  printView,
} from "../src/cli/view.js";
import { buildReport } from "../src/render/dashboard.js";
import { scoreRepo } from "../src/score/score.js";
import type { RepoSignals } from "../src/types.js";

const signal: RepoSignals = {
  name: "alpha",
  fullName: "acme/alpha",
  url: "https://github.com/acme/alpha",
  description: "Alpha service.",
  homepageUrl: null,
  primaryLanguage: "TypeScript",
  languages: ["TypeScript"],
  topics: [],
  isPrivate: false,
  isFork: false,
  isArchived: false,
  isTemplate: false,
  licenseSpdx: "MIT",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  pushedAt: "2026-08-01T00:00:00.000Z",
  stars: 0,
  forks: 0,
  openIssues: 0,
  hasIssuesEnabled: true,
  defaultBranch: "main",
  diskUsageKb: 100,
  readmeBytes: 400,
  hasLicenseFile: true,
  hasWorkflows: true,
  hasDependabotConfig: false,
  hasCodeowners: false,
  hasTestsHeuristic: true,
  hasTestScript: true,
  hasLintConfigHeuristic: false,
  hasLockfile: true,
  hasPackageManifest: true,
  substantialCodebase: true,
  hasSrcLayout: true,
  hasContainerfile: false,
  recentWorkflowConclusion: "success",
  recentWorkflowAgeDays: 2,
  commitsLast30Days: 2,
  commitsLast90Days: 5,
  commitsLast365Days: 20,
  releasesCount: 0,
  latestReleaseAt: null,
  demo: { status: "NONE", url: null, httpStatus: null, latencyMs: null, error: null },
};

describe("cli view helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads latest.json and prints view/top/status", () => {
    const config = defaultConfig("acme");
    const report = buildReport(config, [scoreRepo(signal, config)], 0);
    const root = mkdtempSync(join(tmpdir(), "ruro-cli-"));
    const dataPath = join(root, "data", "latest.json");
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(dataPath, JSON.stringify(report), "utf8");

    const cfg = {
      ...config,
      render: { ...config.render, data_path: "data/latest.json" },
    };
    const loaded = loadLatestReport(cfg, root);
    expect(loaded.repos[0]?.signals.name).toBe("alpha");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printView(loaded);
    printTop(loaded, 1);
    printStatus(loaded, "alpha");
    expect(log.mock.calls.flat().join("\n")).toContain("alpha");
    expect(log.mock.calls.flat().join("\n")).toContain("pillars");
  });
});
