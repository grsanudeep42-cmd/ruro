import { describe, expect, it } from "vitest";
import { computeRegressions } from "../src/history/regressions.js";
import { playbookFor } from "../src/ops/playbook.js";
import { parseIntent } from "../src/cli/narrate.js";
import { defaultConfig } from "../src/config.js";
import { buildReport } from "../src/render/dashboard.js";
import { scoreRepo } from "../src/score/score.js";
import { baseSignals, emptyDemo } from "./helpers.js";

describe("v0.3 operator surfaces", () => {
  it("parses brief/next/diff and silences empty", () => {
    expect(parseIntent("").kind).toBe("empty");
    expect(parseIntent("brief").kind).toBe("brief");
    expect(parseIntent("/next").kind).toBe("next");
    expect(parseIntent("diff").kind).toBe("diff");
  });

  it("maps blockers to playbook actions", () => {
    expect(playbookFor("no_ci")).toMatch(/workflows/i);
    expect(playbookFor("thin_readme")).toMatch(/README/i);
  });

  it("detects demo_lost and score_drop regressions", () => {
    const config = defaultConfig("acme");
    const live = scoreRepo(
      baseSignals({
        name: "alpha",
        fullName: "acme/alpha",
        demo: emptyDemo({
          status: "UP",
          verified: true,
          url: "https://a.test",
          bodyHash: "abc",
        }),
      }),
      config,
      new Date("2026-08-09T12:00:00Z"),
    );
    const dead = scoreRepo(
      baseSignals({
        name: "alpha",
        fullName: "acme/alpha",
        homepageUrl: "https://a.test",
        demo: emptyDemo({
          status: "DOWN",
          verified: false,
          url: "https://a.test",
          error: "parking_or_soft_404",
        }),
        pushedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
      }),
      config,
      new Date("2026-08-09T12:00:00Z"),
    );
    const prev = buildReport(config, [live], 0, []);
    const curr = buildReport(config, [dead], 0, []);
    const regs = computeRegressions(prev, curr);
    expect(regs.some((r) => r.kind === "demo_lost")).toBe(true);
  });
});
