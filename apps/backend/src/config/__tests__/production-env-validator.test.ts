import { describe, expect, it } from "vitest";
import { validateProductionEnvironment, type ProductionEnvironment } from "../production-env-validator.js";

function validEnvironment(): ProductionEnvironment {
  return {
    NODE_ENV: "production",
    MONGODB_URI: "mongodb://user:password@example.test:27017/paperlens",
    REDIS_DEPLOYMENT: "self_hosted",
    REDIS_PASSWORD: "redis-password-that-is-at-least-32-characters",
    REDIS_URL: "redis://default:redis-password-that-is-at-least-32-characters@redis:6379",
    JWT_ACCESS_SECRET: "access-secret-that-is-at-least-32-characters",
    JWT_REFRESH_SECRET: "refresh-secret-that-is-at-least-32-characters",
    GEMINI_API_KEY: "gemini-key",
    CORS_ORIGIN: "https://paperlens.uk",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GOOGLE_CALLBACK_URL: "https://api.paperlens.uk/api/v1/auth/google/callback",
    STORAGE_PROVIDER: "r2",
    R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID: "r2-access",
    R2_SECRET_ACCESS_KEY: "r2-secret",
    R2_BUCKET: "paperlens",
    TRANSLATION_PROVIDER: "libretranslate",
    LIBRETRANSLATE_URL: "http://libretranslate:5000",
    SYNC_ADMIN_BYPASS: "false",
    OPENALEX_MAILTO: "operator@example.test",
    CROSSREF_MAILTO: "operator@example.test",
  };
}

describe("validateProductionEnvironment", () => {
  it("accepts a complete production environment", () => {
    expect(validateProductionEnvironment(validEnvironment())).toEqual([]);
  });

  it("rejects public template placeholders even when they satisfy length checks", () => {
    const values = validEnvironment();
    values.JWT_ACCESS_SECRET = "<required-secret-minimum-32-characters>";
    values.OPENALEX_MAILTO = "<operator-email-address>";

    const errors = validateProductionEnvironment(values);

    expect(errors).toContain("JWT_ACCESS_SECRET still contains a template placeholder");
    expect(errors).toContain("OPENALEX_MAILTO still contains a template placeholder");
  });

  it("rejects unsafe production origins and identical JWT secrets", () => {
    const values = validEnvironment();
    values.CORS_ORIGIN = "http://localhost:5173";
    values.JWT_REFRESH_SECRET = values.JWT_ACCESS_SECRET;

    const errors = validateProductionEnvironment(values);

    expect(errors).toContain("CORS_ORIGIN must contain only HTTPS production origins");
    expect(errors).toContain("JWT access and refresh secrets must be different");
  });

  it("rejects the development-only admin bypass", () => {
    const values = validEnvironment();
    values.SYNC_ADMIN_BYPASS = "true";

    expect(validateProductionEnvironment(values)).toContain(
      "SYNC_ADMIN_BYPASS must be false in production",
    );
  });

  it("rejects external or mismatched Redis configuration", () => {
    const values = validEnvironment();
    values.REDIS_URL = "rediss://default:upstash-password@example.upstash.test:6379";

    const errors = validateProductionEnvironment(values);

    expect(errors).toContain("Self-hosted REDIS_URL hostname must be redis");
    expect(errors).toContain("REDIS_URL password must match REDIS_PASSWORD");
  });
});
