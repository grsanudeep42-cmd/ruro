import { describe, expect, it } from "vitest";
import { isBlockedProbeHost, isLiveSpaShell, probeDemoUrl } from "../src/probes/demo.js";
import { defaultConfig } from "../src/config.js";

describe("probeDemoUrl", () => {
  const config = defaultConfig("acme");

  it("returns NONE when homepage is missing", async () => {
    const result = await probeDemoUrl(null, config);
    expect(result.status).toBe("NONE");
    expect(result.url).toBeNull();
    expect(result.verified).toBe(false);
  });

  it("rejects github.com repo URLs as deployments", async () => {
    const result = await probeDemoUrl("https://github.com/acme/alpha", config, {
      fullName: "acme/alpha",
      repoHtmlUrl: "https://github.com/acme/alpha",
    });
    expect(result.status).toBe("DOWN");
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/github_repo/);
  });

  it("blocks loopback / private IP homepage probes (SSRF)", async () => {
    expect(isBlockedProbeHost("127.0.0.1")).toBe(true);
    expect(isBlockedProbeHost("10.0.0.5")).toBe(true);
    expect(isBlockedProbeHost("169.254.169.254")).toBe(true);
    expect(isBlockedProbeHost("example.com")).toBe(false);
    const result = await probeDemoUrl("http://127.0.0.1/", config);
    expect(result.status).toBe("DOWN");
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/ssrf/i);
  });

  it("normalizes bare domains to https", async () => {
    const result = await probeDemoUrl("example.com", {
      ...config,
      probes: { ...config.probes, timeout_ms: 5000 },
    });
    expect(result.url).toMatch(/^https:\/\/example\.com\/?$/);
    expect(["UP", "DOWN", "ERROR"]).toContain(result.status);
  });

  it("recognizes Vite/React SPA shells as live", () => {
    const html = `<!doctype html><html><head><title>Blood Bank – Community</title>
      <script type="module" src="/assets/index-abc.js"></script>
      <link rel="icon" href="/vite.svg" />
      </head><body><div id="root"></div></body></html>`;
    expect(isLiveSpaShell(html)).toBe(true);
  });
});
