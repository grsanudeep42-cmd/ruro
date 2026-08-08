import { describe, expect, it } from "vitest";
import { analyzeTreeEntries } from "../src/fitness/code.js";

describe("analyzeTreeEntries", () => {
  it("scores nontrivial source+test trees highly", () => {
    const fitness = analyzeTreeEntries([
      { path: "src/main.ts", type: "blob", size: 1200 },
      { path: "src/util.ts", type: "blob", size: 800 },
      { path: "src/api.ts", type: "blob", size: 900 },
      { path: "src/db.ts", type: "blob", size: 700 },
      { path: "src/auth.ts", type: "blob", size: 600 },
      { path: "src/main.test.ts", type: "blob", size: 400 },
      { path: "README.md", type: "blob", size: 500 },
    ]);
    expect(fitness.sourceFiles).toBeGreaterThanOrEqual(5);
    expect(fitness.testFiles).toBeGreaterThanOrEqual(1);
    expect(fitness.score).toBeGreaterThanOrEqual(60);
    expect(fitness.flags).toContain("has_source");
  });

  it("flags empty / no-source trees", () => {
    const fitness = analyzeTreeEntries([
      { path: "README.md", type: "blob", size: 100 },
      { path: "docs/note.md", type: "blob", size: 50 },
    ]);
    expect(fitness.flags).toContain("no_source_files");
    expect(fitness.score).toBeLessThan(40);
  });
});
