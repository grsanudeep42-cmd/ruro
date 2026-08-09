import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig owner guard", () => {
  it("rejects placeholder owners from the example template", () => {
    const dir = mkdtempSync(join(tmpdir(), "ruro-cfg-"));
    const path = join(dir, "ruro.yml");
    copyFileSync(
      join(process.cwd(), "ruro.example.yml"),
      path,
    );
    expect(() => loadConfig(path)).toThrow(/placeholder/i);
  });

  it("accepts a real owner", () => {
    const dir = mkdtempSync(join(tmpdir(), "ruro-cfg-"));
    const path = join(dir, "ruro.yml");
    const raw = readFileSync(
      join(process.cwd(), "ruro.example.yml"),
      "utf8",
    ).replace(/YOUR_GITHUB_LOGIN/g, "octocat");
    writeFileSync(path, raw);
    expect(loadConfig(path).owner).toBe("octocat");
  });
});
