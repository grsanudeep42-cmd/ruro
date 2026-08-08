import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { annotateWithCopilot } from "../src/ai/copilot.js";
import { defaultConfig } from "../src/config.js";
import { buildReport } from "../src/render/dashboard.js";
import { scoreRepo } from "../src/score/score.js";
import { baseSignals, emptyDemo, emptyFitness } from "./helpers.js";

const signal = baseSignals({
  homepageUrl: null,
  demo: emptyDemo(),
  description: "Alpha",
  primaryLanguage: "Go",
  languages: ["Go"],
  hasWorkflows: false,
  hasTestsHeuristic: false,
  hasTestScript: false,
  hasLintConfigHeuristic: false,
  hasLockfile: false,
  hasPackageManifest: false,
  fitness: emptyFitness({ score: 40, flags: ["has_source"] }),
  recentWorkflowConclusion: null,
  recentWorkflowAgeDays: null,
  releasesCount: 0,
  latestReleaseAt: null,
});

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
        timeout_ms: 180_000,
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
