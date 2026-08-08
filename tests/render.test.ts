import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildReport, renderDashboard } from "../src/render/dashboard.js";
import { scoreRepo } from "../src/score/score.js";
import { baseSignals } from "./helpers.js";

describe("renderDashboard", () => {
  it("renders a single-view markdown table", () => {
    const config = defaultConfig("acme");
    const scored = [scoreRepo(baseSignals(), config)];
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
