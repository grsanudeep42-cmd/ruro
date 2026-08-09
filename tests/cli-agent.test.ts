import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../src/config.js";
import { parseIntent, narrateStatus, narrateView, narrateWhy } from "../src/cli/narrate.js";
import { loadLatestReport, normalizeReport } from "../src/cli/view.js";
import { buildReport } from "../src/render/dashboard.js";
import { scoreRepo } from "../src/score/score.js";
import { baseSignals, emptyDemo } from "./helpers.js";

describe("parseIntent", () => {
  it("parses natural language and slash commands", () => {
    expect(parseIntent("view").kind).toBe("view");
    expect(parseIntent("/top 3")).toEqual({ kind: "top", n: 3 });
    expect(parseIntent("why phantom")).toEqual({
      kind: "why",
      arg: "phantom",
    });
    expect(parseIntent("aryanbloodbank")).toEqual({
      kind: "status",
      arg: "aryanbloodbank",
    });
    expect(parseIntent("full alpha")).toEqual({
      kind: "full",
      arg: "alpha",
    });
    expect(parseIntent("/exit").kind).toBe("exit");
    expect(parseIntent("status")).toEqual({ kind: "status" });
    expect(parseIntent("why")).toEqual({ kind: "why" });
    expect(parseIntent("review")).toEqual({ kind: "review" });
    expect(parseIntent("/").kind).toBe("menu");
    expect(parseIntent("/br").kind).toBe("brief");
    expect(parseIntent("/brief").kind).toBe("brief");
    expect(parseIntent("/s").kind).toBe("menu");
    expect(parseIntent("/st").kind).toBe("status");
  });
});

describe("cli narrate + loaders", () => {
  it("loads report and narrates without boxed tables", () => {
    const config = defaultConfig("acme");
    const report = buildReport(
      config,
      [scoreRepo(baseSignals({ homepageUrl: null, demo: emptyDemo() }), config)],
      0,
    );
    const root = mkdtempSync(join(tmpdir(), "ruro-cli-"));
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(join(root, "data", "latest.json"), JSON.stringify(report));

    const loaded = loadLatestReport(
      { ...config, render: { ...config.render, data_path: "data/latest.json" } },
      root,
    );
    expect(loaded.repos[0]?.contributions?.length).toBeGreaterThan(0);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    narrateView(loaded);
    narrateWhy(loaded, config, "alpha");
    const out = log.mock.calls.flat().join("\n");
    expect(out).toContain("ruri");
    expect(out).toContain("alpha");
    expect(out).toContain("biggest movers");
    expect(out).not.toContain("RURO FLEET");
    log.mockRestore();
  });

  it("status works when older scorecards omit ciConclusions", () => {
    const config = defaultConfig("acme");
    const scored = scoreRepo(
      baseSignals({ homepageUrl: null, demo: emptyDemo() }),
      config,
    );
    const raw = buildReport(config, [scored], 0);
    // Simulate pre-v0.3 on-disk JSON
    delete (raw.repos[0]!.signals as { ciConclusions?: string[] }).ciConclusions;
    delete (raw.repos[0]!.signals as { ownerCommitShare?: number | null })
      .ownerCommitShare;

    const normalized = normalizeReport(raw);
    expect(normalized.repos[0]!.signals.ciConclusions).toEqual([]);
    expect(normalized.repos[0]!.signals.ownerCommitShare).toBeNull();

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => narrateStatus(normalized, "alpha")).not.toThrow();
    const out = log.mock.calls.flat().join("\n");
    expect(out).toContain("alpha");
    expect(out).toMatch(/CI:/);
    log.mockRestore();
  });
});
