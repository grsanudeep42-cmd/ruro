import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { deriveStatus, scoreRepo } from "../src/score/score.js";
import { baseSignals, emptyDemo, emptyFitness } from "./helpers.js";

describe("scoreRepo", () => {
  const config = defaultConfig("acme");

  it("scores a healthy live repo highly and deterministically", () => {
    const a = scoreRepo(baseSignals({ name: "demo", fullName: "acme/demo" }), config);
    const b = scoreRepo(baseSignals({ name: "demo", fullName: "acme/demo" }), config);
    expect(a.score).toBe(b.score);
    expect(a.score).toBeGreaterThanOrEqual(75);
    expect(a.status).toBe("LIVE");
    expect(a.drivers).toContain("demo_verified");
    expect(
      a.drivers.some((d) => d.includes("test") || d.includes("fitness")),
    ).toBe(true);
    expect(a.drivers).toContain("code_fitness_high");
  });

  it("penalizes abandoned repos without demos or tests", () => {
    const abandoned = scoreRepo(
      baseSignals({
        name: "demo",
        fullName: "acme/demo",
        pushedAt: new Date(Date.now() - 864e5 * 500).toISOString(),
        commitsLast30Days: 0,
        commitsLast90Days: 0,
        commitsLast365Days: 0,
        hasTestsHeuristic: false,
        hasTestScript: false,
        hasWorkflows: false,
        hasLintConfigHeuristic: false,
        hasDependabotConfig: false,
        hasPackageManifest: false,
        substantialCodebase: false,
        hasSrcLayout: false,
        hasContainerfile: false,
        readmeBytes: 40,
        description: "tmp",
        topics: [],
        homepageUrl: null,
        demo: emptyDemo(),
        fitness: emptyFitness({
          sourceFiles: 0,
          testFiles: 0,
          score: 5,
          flags: ["no_source_files", "tiny_tree"],
        }),
        recentWorkflowConclusion: null,
        recentWorkflowAgeDays: null,
        releasesCount: 0,
        latestReleaseAt: null,
        diskUsageKb: 20,
      }),
      config,
    );
    expect(abandoned.score).toBeLessThan(45);
    expect(abandoned.status).toBe("DEAD");
  });
});

describe("deriveStatus", () => {
  const thresholds = defaultConfig("acme").thresholds;

  it("marks archived regardless of activity", () => {
    expect(
      deriveStatus(baseSignals({ isArchived: true }), thresholds),
    ).toBe("ARCHIVED");
  });

  it("requires verified demo for LIVE", () => {
    expect(
      deriveStatus(
        baseSignals({
          demo: emptyDemo({
            status: "UP",
            url: "https://x.com",
            verified: false,
          }),
        }),
        thresholds,
      ),
    ).not.toBe("LIVE");
  });
});
