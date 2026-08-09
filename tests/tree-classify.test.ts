import { describe, expect, it } from "vitest";
import {
  analyzeTreeEntries,
  classifyTreePaths,
} from "../src/fitness/code.js";

describe("tree classifiers", () => {
  it("derives structure flags from paths", () => {
    const entries = [
      { path: "package.json", type: "blob", size: 120 },
      { path: "package-lock.json", type: "blob", size: 4000 },
      { path: "src/main.ts", type: "blob", size: 800 },
      { path: "src/main.test.ts", type: "blob", size: 400 },
      { path: "vitest.config.ts", type: "blob", size: 200 },
      { path: ".github/workflows/ci.yml", type: "blob", size: 300 },
      { path: "eslint.config.js", type: "blob", size: 100 },
      { path: "Dockerfile", type: "blob", size: 90 },
      { path: "LICENSE", type: "blob", size: 50 },
    ];
    const patch = classifyTreePaths(entries);
    expect(patch.hasPackageManifest).toBe(true);
    expect(patch.hasLockfile).toBe(true);
    expect(patch.hasSrcLayout).toBe(true);
    expect(patch.hasWorkflows).toBe(true);
    expect(patch.hasLintConfigHeuristic).toBe(true);
    expect(patch.hasContainerfile).toBe(true);
    expect(patch.hasTestsHeuristic).toBe(true);
    expect(patch.hasTestScript).toBe(true);
    expect(patch.hasLicenseFile).toBe(true);

    const fitness = analyzeTreeEntries(entries);
    expect(fitness.sourceFiles).toBeGreaterThanOrEqual(1);
    expect(fitness.testFiles).toBeGreaterThanOrEqual(1);
    expect(fitness.flags).toContain("has_source");
  });
});
