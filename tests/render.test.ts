import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildReport, renderDashboard } from "../src/render/dashboard.js";
import { scoreRepo } from "../src/score/score.js";
import type { RepoSignals } from "../src/types.js";

const signal: RepoSignals = {
  name: "alpha",
  fullName: "acme/alpha",
  url: "https://github.com/acme/alpha",
  description: "Alpha service used in production by real customers daily.",
  homepageUrl: "https://alpha.example.com",
  primaryLanguage: "Go",
  languages: ["Go"],
  topics: ["api", "go"],
  isPrivate: false,
  isFork: false,
  isArchived: false,
  isTemplate: false,
  licenseSpdx: "Apache-2.0",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  pushedAt: "2026-08-01T00:00:00.000Z",
  stars: 1,
  forks: 0,
  openIssues: 0,
  hasIssuesEnabled: true,
  defaultBranch: "main",
  diskUsageKb: 900,
  readmeBytes: 1200,
  hasLicenseFile: true,
  hasWorkflows: true,
  hasDependabotConfig: false,
  hasCodeowners: false,
  hasTestsHeuristic: true,
  hasTestScript: true,
  hasLintConfigHeuristic: true,
  hasLockfile: true,
  hasPackageManifest: true,
  substantialCodebase: true,
  hasSrcLayout: true,
  hasContainerfile: false,
  recentWorkflowConclusion: "success",
  recentWorkflowAgeDays: 3,
  commitsLast30Days: 4,
  commitsLast90Days: 10,
  commitsLast365Days: 30,
  releasesCount: 1,
  latestReleaseAt: "2026-07-01T00:00:00.000Z",
  demo: {
    status: "UP",
    url: "https://alpha.example.com",
    httpStatus: 200,
    latencyMs: 80,
    error: null,
  },
};

describe("renderDashboard", () => {
  it("renders a single-view markdown table", () => {
    const config = defaultConfig("acme");
    const scored = [scoreRepo(signal, config)];
    const report = buildReport(config, scored, 0);
    const md = renderDashboard(report, config);
    expect(md).toContain("# Ruro Portfolio Scorecard");
    expect(md).toContain("## All projects");
    expect(md).toContain("acme/alpha".split("/")[1]);
    expect(md).toContain("## Status changes");
    expect(md).toContain("`LIVE`");
    expect(md).toContain("Zero AI");
  });
});
