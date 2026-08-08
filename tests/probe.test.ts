import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { probeDemoUrl } from "../src/probes/demo.js";

describe("probeDemoUrl", () => {
  const config = defaultConfig("acme");

  it("returns NONE when homepage is missing", async () => {
    const result = await probeDemoUrl(null, config);
    expect(result.status).toBe("NONE");
    expect(result.url).toBeNull();
  });

  it("normalizes bare domains to https", async () => {
    const result = await probeDemoUrl("example.com", {
      ...config,
      probes: { ...config.probes, timeout_ms: 5000 },
    });
    expect(result.url).toMatch(/^https:\/\/example\.com\/?$/);
    expect(["UP", "DOWN", "ERROR"]).toContain(result.status);
  });
});
