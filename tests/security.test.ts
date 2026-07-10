import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/security";
import { createRateLimiter } from "@/lib/rate-limit";

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/ingest", { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  it("allows same-origin browser requests", () => {
    expect(
      isSameOriginRequest(
        request({ origin: "http://localhost:3000", host: "localhost:3000" })
      )
    ).toBe(true);
  });

  it("rejects cross-origin browser requests", () => {
    expect(
      isSameOriginRequest(request({ origin: "https://evil.example", host: "localhost:3000" }))
    ).toBe(false);
  });

  it("rejects explicit cross-site fetch metadata even without Origin", () => {
    expect(isSameOriginRequest(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("rejects opaque (null) origins", () => {
    expect(isSameOriginRequest(request({ origin: "null", host: "localhost:3000" }))).toBe(false);
  });

  it("allows non-browser clients with no Origin header", () => {
    expect(isSameOriginRequest(request({}))).toBe(true);
  });

  it("rejects malformed Origin values", () => {
    expect(isSameOriginRequest(request({ origin: "not a url", host: "x" }))).toBe(false);
  });
});

describe("createRateLimiter", () => {
  it("allows up to max hits per window, then rejects", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 100)).toBe(true);
    expect(limiter.allow("a", 200)).toBe(false);
  });

  it("frees the slot once the window has passed", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 500)).toBe(false);
    expect(limiter.allow("a", 1500)).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
  });

  it("does not extend the window on rejected calls", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 900)).toBe(false); // rejected — must not count
    expect(limiter.allow("a", 1100)).toBe(true);
  });
});
