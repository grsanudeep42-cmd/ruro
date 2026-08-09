import { describe, expect, it } from "vitest";
import { explainCode, explainScoreLine } from "../src/score/explain.js";

describe("explain", () => {
  it("explains known driver codes", () => {
    expect(explainCode("demo_verified")).toMatch(/proof|HTTP/i);
    expect(explainCode("no_tests_detected")).toMatch(/test/i);
  });

  it("prints score math lines", () => {
    const lines = explainScoreLine(
      50,
      { quality: 60, alive: 40, structure: 50 },
      { quality: 0.4, alive: 0.35, structure: 0.25 },
    );
    expect(lines.join("\n")).toContain("showability");
    expect(lines.join("\n")).toContain("50");
  });
});
