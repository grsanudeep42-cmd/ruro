import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  loadLatestReport,
  printStatus,
  printTop,
  printView,
  printWhy,
} from "../src/cli/view.js";
import { buildReport } from "../src/render/dashboard.js";
import { scoreRepo } from "../src/score/score.js";
import { baseSignals, emptyDemo } from "./helpers.js";

describe("cli view helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads latest.json and prints view/top/status/why", () => {
    const config = defaultConfig("acme");
    const signal = baseSignals({
      homepageUrl: null,
      demo: emptyDemo(),
      description: "Alpha service.",
    });
    const report = buildReport(config, [scoreRepo(signal, config)], 0);
    const root = mkdtempSync(join(tmpdir(), "ruro-cli-"));
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(join(root, "data", "latest.json"), JSON.stringify(report), "utf8");

    const cfg = {
      ...config,
      render: { ...config.render, data_path: "data/latest.json" },
    };
    const loaded = loadLatestReport(cfg, root);
    expect(loaded.repos[0]?.signals.name).toBe("alpha");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printView(loaded);
    printTop(loaded, 1);
    printStatus(loaded, "alpha");
    printWhy(loaded, cfg, "alpha");
    const out = log.mock.calls.flat().join("\n");
    expect(out).toContain("RURO FLEET");
    expect(out).toContain("alpha");
    expect(out).toContain("RURO WHY");
    expect(out).toContain("showability");
  });
});
