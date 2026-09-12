import { describe, expect, it } from "vitest";
import { isAllowedCorsOrigin } from "../app.js";

describe("isAllowedCorsOrigin", () => {
  const allowed = ["http://localhost:5173", "https://example.com"];

  it("allows configured origins", () => {
    expect(isAllowedCorsOrigin("https://example.com", allowed, "production")).toBe(true);
  });

  it("allows Flutter Web random localhost ports in development", () => {
    expect(isAllowedCorsOrigin("http://localhost:61992", allowed, "development")).toBe(true);
    expect(isAllowedCorsOrigin("http://127.0.0.1:61992", allowed, "development")).toBe(true);
  });

  it("does not allow unconfigured localhost ports in production", () => {
    expect(isAllowedCorsOrigin("http://localhost:61992", allowed, "production")).toBe(false);
  });

  it("rejects non-localhost origins unless configured", () => {
    expect(isAllowedCorsOrigin("https://evil.example", allowed, "development")).toBe(false);
  });
});
