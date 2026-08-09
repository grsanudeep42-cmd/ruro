import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { deriveStatus, scoreRepo } from "../src/score/score.js";
import { baseSignals, emptyDemo, emptyFitness } from "./helpers.js";

const NOW = new Date("2026-08-09T12:00:00.000Z");

describe("scoreRepo contributions", () => {
  const config = defaultConfig("acme");

  it("scores a healthy live repo highly and deterministically", () => {
    const a = scoreRepo(
      baseSignals({ name: "demo", fullName: "acme/demo" }),
      config,
      NOW,
    );
    const b = scoreRepo(
      baseSignals({ name: "demo", fullName: "acme/demo" }),
      config,
      NOW,
    );
    expect(a.score).toBe(b.score);
    expect(a.score).toBeGreaterThanOrEqual(75);
    expect(a.status).toBe("LIVE");
    expect(a.drivers).toContain("demo_verified");
    expect(a.contributions.some((c) => c.code === "demo_verified" && c.delta === 35)).toBe(
      true,
    );
    expect(a.contributions.length).toBeGreaterThan(5);
  });

  it("penalizes abandoned repos without demos or tests", () => {
    const abandoned = scoreRepo(
      baseSignals({
        name: "demo",
        fullName: "acme/demo",
        pushedAt: new Date(NOW.getTime() - 864e5 * 500).toISOString(),
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
      NOW,
    );
    expect(abandoned.score).toBeLessThan(45);
    expect(abandoned.status).toBe("DEAD");
  });
});

describe("deriveStatus LIVE honesty", () => {
  const thresholds = defaultConfig("acme").thresholds;

  it("marks archived regardless of activity", () => {
    expect(
      deriveStatus(baseSignals({ isArchived: true }), thresholds, NOW),
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
        NOW,
      ),
    ).not.toBe("LIVE");
  });

  it("rejects LIVE zombies — verified but push older than active_days", () => {
    const old = baseSignals({
      pushedAt: new Date(NOW.getTime() - 864e5 * 120).toISOString(),
      demo: emptyDemo({
        status: "UP",
        url: "https://x.com",
        verified: true,
        httpStatus: 200,
        proofBytes: 2000,
      }),
    });
    expect(deriveStatus(old, thresholds, NOW)).toBe("STALE");
    expect(old.demo.verified).toBe(true);
  });

  it("LIVE when verified and pushed within active_days", () => {
    expect(
      deriveStatus(
        baseSignals({
          pushedAt: new Date(NOW.getTime() - 864e5 * 10).toISOString(),
        }),
        thresholds,
        NOW,
      ),
    ).toBe("LIVE");
  });
});
