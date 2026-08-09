import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildReport } from "../src/render/dashboard.js";
import { renderWebDashboard } from "../src/render/web.js";
import { scoreRepo } from "../src/score/score.js";
import { baseSignals } from "./helpers.js";

describe("renderWebDashboard", () => {
  it("renders OS home with verified deploy zone", () => {
    const config = defaultConfig("acme");
    const scored = [scoreRepo(baseSignals(), config)];
    const report = buildReport(config, scored, 0);
    const html = renderWebDashboard(report, config);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("RURO");
    expect(html).toContain("Your GitHub, operated.");
    expect(html).toContain("Proven");
    expect(html).toContain("Attention");
    expect(html).toContain("Syne");
    expect(html).toContain("alpha");
    expect(html).not.toContain("purple");
  });
});
