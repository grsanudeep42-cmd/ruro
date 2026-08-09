import { describe, expect, it } from "vitest";
import {
  citationHits,
  extractCitedPaths,
} from "../src/ai/copilot.js";

describe("copilot citation gate", () => {
  const dossier = `
# dossier
./src/app.ts
### package.json
### bloodlink/src/main.tsx
`;

  it("extracts file paths from review text", () => {
    const text =
      "See `src/app.ts` and package.json for the Vite entry; also bloodlink/src/main.tsx.";
    const cited = extractCitedPaths(text);
    expect(cited).toEqual(
      expect.arrayContaining(["src/app.ts", "package.json", "bloodlink/src/main.tsx"]),
    );
  });

  it("requires hits against the dossier", () => {
    const good =
      "Real code in src/app.ts and package.json with bloodlink/src/main.tsx.";
    expect(citationHits(good, dossier).length).toBeGreaterThanOrEqual(2);

    const bad = "This is a great app with auth and billing.";
    expect(citationHits(bad, dossier).length).toBe(0);
  });
});
