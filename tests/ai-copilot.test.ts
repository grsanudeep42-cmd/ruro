import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { annotateWithCopilot } from "../src/ai/copilot.js";
import { defaultConfig } from "../src/config.js";
import { buildReport } from "../src/render/dashboard.js";
import { scoreRepo } from "../src/score/score.js";
import type { RepoSignals } from "../src/types.js";

const signal: RepoSignals = {
  name: "alpha",
  fullName: "acme/alpha",
  url: "https://github.com/acme/alpha",
  description: "Alpha",
  homepageUrl: null,
  primaryLanguage: "Go",
  languages: ["Go"],
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
  readmeBytes: 200,
  hasLicenseFile: true,
  hasWorkflows: false,
  hasDependabotConfig: false,
  hasCodeowners: false,
  hasTestsHeuristic: false,
  hasTestScript: false,
  hasLintConfigHeuristic: false,
  hasLockfile: false,
  hasPackageManifest: false,
  substantialCodebase: true,
  hasSrcLayout: true,
  hasContainerfile: false,
  recentWorkflowConclusion: null,
  recentWorkflowAgeDays: null,
  commitsLast30Days: 1,
  commitsLast90Days: 2,
  commitsLast365Days: 5,
  releasesCount: 0,
  latestReleaseAt: null,
  demo: { status: "NONE", url: null, httpStatus: null, latencyMs: null, error: null },
};

describe("annotateWithCopilot", () => {
  it("skips when ai disabled", async () => {
    const config = defaultConfig("acme");
    const report = buildReport(config, [scoreRepo(signal, config)], 0);
    const root = mkdtempSync(join(tmpdir(), "ruro-ai-"));
    const result = await annotateWithCopilot({ report, config, cwd: root });
    expect(result.skipped).toBe(true);
    expect(result.annotated).toBe(0);
  });

  it("writes soft-fail cache when enabled without CLI", async () => {
    const config = {
      ...defaultConfig("acme"),
      ai: {
        enabled: true,
        provider: "copilot" as const,
        top_n: 5,
        cache_dir: "data/ai",
      },
    };
    const report = buildReport(config, [scoreRepo(signal, config)], 0);
    const root = mkdtempSync(join(tmpdir(), "ruro-ai-"));
    const result = await annotateWithCopilot({ report, config, cwd: root });
    expect(result.skipped || result.annotated >= 0).toBe(true);
    const cache = readFileSync(join(root, "data/ai/latest.json"), "utf8");
    expect(cache).toContain("copilot");
  });
});
