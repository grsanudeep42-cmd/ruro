import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  renderProfileSnippet,
  renderProfileSvg,
} from "../src/render/profile.js";
import type { RuroReport, ScoredRepo } from "../src/types.js";
import { baseSignals, emptyDemo } from "./helpers.js";

function stubRepo(name: string, score: number, status: ScoredRepo["status"]): ScoredRepo {
  return {
    score,
    status,
    pillars: { quality: score, alive: score, structure: score },
    drivers: ["demo_verified"],
    blockers: [],
    signals: baseSignals({
      name,
      fullName: `acme/${name}`,
      url: `https://github.com/acme/${name}`,
      demo: emptyDemo({
        status: "UP",
        url: "https://example.com",
        finalUrl: "https://example.com",
        httpStatus: 200,
        latencyMs: 50,
        proofBytes: 1000,
        contentType: "text/html",
        verified: true,
      }),
    }),
  };
}

const report: RuroReport = {
  schema_version: 1,
  generated_at: "2026-08-08T12:00:00.000Z",
  owner: "acme",
  repo_count: 2,
  included_count: 2,
  excluded_count: 0,
  status_counts: {
    LIVE: 1,
    ACTIVE: 1,
    STALE: 0,
    DORMANT: 0,
    DEAD: 0,
    ARCHIVED: 0,
  },
  weights: { quality: 0.4, alive: 0.35, structure: 0.25 },
  repos: [stubRepo("alpha", 88, "LIVE"), stubRepo("beta", 61, "ACTIVE")],
  transitions: [],
};

describe("profile renderers", () => {
  const config = defaultConfig("acme");

  it("renders an SVG card with top projects", () => {
    const svg = renderProfileSvg(report, config);
    expect(svg).toContain("<svg");
    expect(svg).toContain("ruro view");
    expect(svg).toContain("alpha");
    expect(svg).toContain("88");
  });

  it("renders a profile README snippet with markers", () => {
    const md = renderProfileSnippet(report, config);
    expect(md).toContain("<!-- RURO:START -->");
    expect(md).toContain("<!-- RURO:END -->");
    expect(md).toContain("## ░ RURO");
    expect(md).toContain("alpha");
  });
});
