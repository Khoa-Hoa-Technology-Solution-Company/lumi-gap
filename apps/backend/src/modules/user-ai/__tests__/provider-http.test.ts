import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../../../config/env.js";
import { isLocalAiAddress, isPublicAiAddress, normalizeAiBaseUrl, providerJson, resolveAiEndpointUrl } from "../provider-http.js";

const originalOrigins = env.AI_ALLOWED_BASE_URLS;
const originalLocal = env.AI_ALLOW_LOCAL_ENDPOINTS;
const originalLocalhostHost = env.AI_LOCALHOST_HOST;
beforeEach(() => { env.AI_ALLOWED_BASE_URLS = ""; env.AI_ALLOW_LOCAL_ENDPOINTS = false; env.AI_LOCALHOST_HOST = ""; });
afterEach(() => { env.AI_ALLOWED_BASE_URLS = originalOrigins; env.AI_ALLOW_LOCAL_ENDPOINTS = originalLocal; env.AI_LOCALHOST_HOST = originalLocalhostHost; });

describe("personal AI endpoint requests", () => {
  it.each(["127.0.0.1", "10.10.0.1", "172.17.0.1", "192.168.1.50", "100.64.0.1", "::1", "fd00::1", "::ffff:192.168.1.1", "::ffff:c0a8:101"])("recognizes local gateway address %s", (ip) => {
    expect(isLocalAiAddress(ip)).toBe(true);
  });
  it.each(["169.254.169.254", "0.0.0.0", "224.0.0.1", "203.0.113.1", "8.8.8.8", "::", "fe80::1", "::ffff:a9fe:a9fe"])("does not grant general local access to reserved/public address %s", (ip) => {
    expect(isLocalAiAddress(ip)).toBe(false);
  });
  it("routes loopback to the Docker host on any port without changing stored Base URLs", () => {
    env.AI_LOCALHOST_HOST = "host.docker.internal";
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(resolveAiEndpointUrl(`http://${host}:51736/v1/models`).toString()).toBe("http://host.docker.internal:51736/v1/models");
    }
    expect(resolveAiEndpointUrl("http://localhost:11434/v1/models").hostname).toBe("host.docker.internal");
    expect(normalizeAiBaseUrl("http://localhost:51736/v1", "openai-compatible")).toBe("http://localhost:51736/v1");
    expect(resolveAiEndpointUrl("http://localhost.evil.example:51736/v1/models").hostname).toBe("localhost.evil.example");
    expect(resolveAiEndpointUrl("http://192.168.1.10:1234/v1/models").hostname).toBe("192.168.1.10");
    env.AI_LOCALHOST_HOST = "";
    expect(resolveAiEndpointUrl("http://localhost:51736/v1/models").hostname).toBe("localhost");
  });
  it("allows multiple local HTTP ports when enabled without individually allowing origins", async () => {
    const servers = Array.from({ length: 2 }, () => createServer((req, res) => {
      expect(req.headers.authorization).toBe("Bearer local-test-key");
      expect(req.url).toBe("/v1/models");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "local-model" }] }));
    }));
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))));
    env.AI_ALLOW_LOCAL_ENDPOINTS = true;
    try {
      for (const server of servers) {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Missing address");
        expect(await providerJson(`http://127.0.0.1:${address.port}/v1/models`, "local-test-key", "openai-compatible")).toEqual({ data: [{ id: "local-model" }] });
      }
      await expect(providerJson("http://169.254.169.254/v1/models", "local-test-key", "openai-compatible")).rejects.toMatchObject({ statusCode: 400 });
      await expect(providerJson("http://8.8.8.8/v1/models", "local-test-key", "openai-compatible")).rejects.toMatchObject({ statusCode: 400 });
    } finally { await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve())))); }
  });
  it.each([
    ["RequestsPerDay", "5s", undefined],
    ["RequestsPerMinute", "5s", 6000],
    ["RequestsPerMinute", "120s", undefined],
  ])("distinguishes exhausted quota from short rate limits: %s", async (quotaId, retryDelay, expectedDelay) => {
    const server = createServer((_req, res) => {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { details: [{ violations: [{ quotaId }] }, { retryDelay }] } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing address");
    env.AI_ALLOWED_BASE_URLS = `http://127.0.0.1:${address.port}`;
    try {
      await expect(providerJson(`${env.AI_ALLOWED_BASE_URLS}/models`, "test-secret", "gemini")).rejects.toMatchObject({ status: 429, retryDelayMs: expectedDelay, nonRetryable: expectedDelay === undefined });
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
  it("normalizes version paths and rejects embedded URL credentials", () => {
    expect(normalizeAiBaseUrl("https://example.com/v1beta/", "gemini")).toBe("https://example.com");
    expect(normalizeAiBaseUrl("https://example.com/", "openai-compatible")).toBe("https://example.com/v1");
    expect(() => normalizeAiBaseUrl("https://user:secret@example.com/v1", "gemini")).toThrow("without credentials");
    expect(() => normalizeAiBaseUrl("file:///secret", "gemini")).toThrow("HTTP(S)");
  });
  it.each(["127.0.0.1", "169.254.169.254", "10.0.0.1", "172.16.0.1", "192.168.1.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fe80::1", "fc00::1"])("rejects private and reserved address %s", (ip) => {
    expect(isPublicAiAddress(ip)).toBe(false);
  });
  it("allows public addresses and blocks a local endpoint unless explicitly trusted", async () => {
    expect(isPublicAiAddress("8.8.8.8")).toBe(true);
    await expect(providerJson("https://127.0.0.1/models", "secret", "gemini")).rejects.toMatchObject({ statusCode: 400 });
  });
  it("sends the right credential header to an allowed gateway and does not follow redirects", async () => {
    let calls = 0;
    const server = createServer((req, res) => {
      calls++;
      expect(req.headers.authorization).toBe("Bearer private-test-key");
      res.writeHead(302, { location: "http://127.0.0.1:1/secret" });
      res.end("private-test-key");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing server address");
    const origin = `http://127.0.0.1:${address.port}`;
    env.AI_ALLOWED_BASE_URLS = origin;
    try {
      const error = await providerJson(`${origin}/models`, "private-test-key", "openai-compatible").catch((value: unknown) => value);
      expect((error as Error).message).not.toContain("private-test-key");
      expect(calls).toBe(1);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
