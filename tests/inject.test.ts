import { describe, expect, it } from "vitest";
import { injectRuroBlock } from "../src/profile/inject.js";

describe("injectRuroBlock", () => {
  it("replaces content between markers", () => {
    const readme = `# Hi\n\n<!-- RURO:START -->\nold\n<!-- RURO:END -->\n\n## Next\n`;
    const next = injectRuroBlock(
      readme,
      "<!-- RURO:START -->\nnew block\n<!-- RURO:END -->",
    );
    expect(next).toContain("new block");
    expect(next).not.toContain("old");
    expect(next).toContain("## Next");
  });

  it("replaces PROJECTS section when markers are missing", () => {
    const readme = `## ABOUT\n\nx\n\n## ░ PROJECTS\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n## ░ TROPHIES\n\ny\n`;
    const next = injectRuroBlock(
      readme,
      "<!-- RURO:START -->\nPORTFOLIO\n<!-- RURO:END -->",
    );
    expect(next).toContain("PORTFOLIO");
    expect(next).toContain("## ░ TROPHIES");
    expect(next).not.toContain("| a | b |");
  });
});
