import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headersFor, parseHeaders } from "./headers.ts";

describe("parseHeaders", () => {
  it("reads the headers under each path", () => {
    const rules = parseHeaders("/*\n  X-A: 1\n  X-B: two words\n/assets/*\n  X-C: 3\n");
    expect(rules).toEqual([
      { path: "/*", headers: { "X-A": "1", "X-B": "two words" } },
      { path: "/assets/*", headers: { "X-C": "3" } },
    ]);
  });

  it("ignores comments and blank lines", () => {
    expect(parseHeaders("# memo\n\n/*\n  # inner\n  X-A: 1\n")).toEqual([
      { path: "/*", headers: { "X-A": "1" } },
    ]);
  });

  it("keeps colons inside a value", () => {
    const [rule] = parseHeaders("/*\n  Content-Security-Policy: connect-src http://127.0.0.1:*\n");
    expect(rule?.headers["Content-Security-Policy"]).toBe("connect-src http://127.0.0.1:*");
  });

  it("rejects a header line outside a path", () => {
    expect(() => parseHeaders("  X-A: 1\n")).toThrow(/path/);
  });
});

describe("headersFor", () => {
  const rules = parseHeaders("/*\n  X-A: 1\n/assets/*\n  X-B: 2\n");

  it("merges every rule whose path matches", () => {
    expect(headersFor(rules, "/assets/app.js")).toEqual({ "X-A": "1", "X-B": "2" });
  });

  it("skips a rule whose path does not match", () => {
    expect(headersFor(rules, "/index.html")).toEqual({ "X-A": "1" });
  });
});

// 本番 (Cloudflare) と E2E の両方が読む apps/web/public/_headers の中身 (docs/design/07-security.md)
describe("apps/web/public/_headers", () => {
  const text = readFileSync(new URL("../apps/web/public/_headers", import.meta.url), "utf8");
  const page = headersFor(parseHeaders(text), "/");
  const csp = Object.fromEntries(
    (page["Content-Security-Policy"] ?? "")
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([name, ...values]) => [name, values]),
  );

  it("loads scripts only from the same origin", () => {
    expect(csp["script-src"]).toEqual(["'self'"]);
  });

  it("connects only to the same origin and the local VOICEVOX ports", () => {
    expect(csp["connect-src"]).toEqual(["'self'", "http://127.0.0.1:*", "http://localhost:*"]);
  });

  it("forbids framing by other sites", () => {
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
  });

  it("requires Trusted Types for scripts", () => {
    expect(csp["require-trusted-types-for"]).toEqual(["'script'"]);
  });

  it("allows the screen wake lock only for the same origin", () => {
    expect(page["Permissions-Policy"]).toContain("screen-wake-lock=(self)");
  });
});
