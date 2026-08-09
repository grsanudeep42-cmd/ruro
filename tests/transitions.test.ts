import { describe, expect, it } from "vitest";
import { computeTransitions } from "../src/history/transitions.js";
import type { RuroReport, ScoredRepo } from "../src/types.js";
import { baseSignals, emptyDemo } from "./helpers.js";

function stubRepo(
  name: string,
  status: ScoredRepo["status"],
  score: number,
): ScoredRepo {
  return {
    score,
    status,
    pillars: { quality: score, alive: score, structure: score },
    drivers: [],
    blockers: [],
    contributions: [],
    signals: baseSignals({
      name,
      fullName: `acme/${name}`,
      url: `https://github.com/acme/${name}`,
      homepageUrl: null,
      demo: emptyDemo(),
    }),
  };
}

function stubReport(repos: ScoredRepo[]): RuroReport {
  return {
    schema_version: 1,
    generated_at: "2026-08-08T00:00:00.000Z",
    owner: "acme",
    repo_count: repos.length,
    included_count: repos.length,
    excluded_count: 0,
    status_counts: {
      LIVE: 0,
      ACTIVE: 0,
      STALE: 0,
      DORMANT: 0,
      DEAD: 0,
      ARCHIVED: 0,
    },
    weights: { quality: 0.4, alive: 0.35, structure: 0.25 },
    repos,
    transitions: [],
  };
}

describe("computeTransitions", () => {
  it("returns empty when there is no previous report", () => {
    expect(computeTransitions(null, stubReport([stubRepo("a", "LIVE", 80)]))).toEqual(
      [],
    );
  });

  it("detects status changes only", () => {
    const prev = stubReport([
      stubRepo("alpha", "ACTIVE", 40),
      stubRepo("beta", "LIVE", 70),
    ]);
    const next = stubReport([
      stubRepo("alpha", "STALE", 30),
      stubRepo("beta", "LIVE", 72),
    ]);
    const transitions = computeTransitions(prev, next);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      name: "alpha",
      from: "ACTIVE",
      to: "STALE",
      scoreFrom: 40,
      scoreTo: 30,
    });
  });
});
