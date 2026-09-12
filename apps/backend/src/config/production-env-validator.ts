export type ProductionEnvironment = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  "MONGODB_URI",
  "REDIS_DEPLOYMENT",
  "REDIS_PASSWORD",
  "REDIS_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "GEMINI_API_KEY",
] as const;

const R2_KEYS = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
const PLACEHOLDER_PATTERN = /^<[^>]+>$/;

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateProductionEnvironment(values: ProductionEnvironment): string[] {
  const errors: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (value && PLACEHOLDER_PATTERN.test(value.trim())) {
      errors.push(`${key} still contains a template placeholder`);
    }
  }

  for (const key of REQUIRED_KEYS) {
    if (isMissing(values[key])) errors.push(`${key} is required`);
  }

  if (values.NODE_ENV !== "production") {
    errors.push("NODE_ENV must be production");
  }
  if (values.SYNC_ADMIN_BYPASS === "true") {
    errors.push("SYNC_ADMIN_BYPASS must be false in production");
  }

  if (!values.MONGODB_URI?.startsWith("mongodb://") && !values.MONGODB_URI?.startsWith("mongodb+srv://")) {
    errors.push("MONGODB_URI must use mongodb:// or mongodb+srv://");
  }

  if (!values.REDIS_URL?.startsWith("redis://") && !values.REDIS_URL?.startsWith("rediss://")) {
    errors.push("REDIS_URL must use redis:// or rediss://");
  }
  if (values.REDIS_DEPLOYMENT !== "self_hosted") {
    errors.push("REDIS_DEPLOYMENT must be self_hosted");
  }
  if ((values.REDIS_PASSWORD?.length ?? 0) < 32) {
    errors.push("REDIS_PASSWORD must contain at least 32 characters");
  }
  try {
    const redisUrl = new URL(values.REDIS_URL ?? "");
    if (redisUrl.hostname !== "redis") {
      errors.push("Self-hosted REDIS_URL hostname must be redis");
    }
    if (!redisUrl.password) {
      errors.push("Self-hosted REDIS_URL must include a password");
    } else if (decodeURIComponent(redisUrl.password) !== values.REDIS_PASSWORD) {
      errors.push("REDIS_URL password must match REDIS_PASSWORD");
    }
  } catch {
    // The protocol validation above reports malformed or unsupported values.
  }

  if ((values.JWT_ACCESS_SECRET?.length ?? 0) < 32) {
    errors.push("JWT_ACCESS_SECRET must contain at least 32 characters");
  }
  if ((values.JWT_REFRESH_SECRET?.length ?? 0) < 32) {
    errors.push("JWT_REFRESH_SECRET must contain at least 32 characters");
  }
  if (values.JWT_ACCESS_SECRET && values.JWT_ACCESS_SECRET === values.JWT_REFRESH_SECRET) {
    errors.push("JWT access and refresh secrets must be different");
  }

  const corsOrigins = values.CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  if (corsOrigins.length === 0 || corsOrigins.some((origin) => !isHttpsUrl(origin))) {
    errors.push("CORS_ORIGIN must contain only HTTPS production origins");
  }

  if (!isHttpsUrl(values.GOOGLE_CALLBACK_URL)) {
    errors.push("GOOGLE_CALLBACK_URL must be an HTTPS URL");
  } else if (!values.GOOGLE_CALLBACK_URL?.endsWith("/api/v1/auth/google/callback")) {
    errors.push("GOOGLE_CALLBACK_URL must end with /api/v1/auth/google/callback");
  }

  if (isMissing(values.GOOGLE_CLIENT_ID) || isMissing(values.GOOGLE_CLIENT_SECRET)) {
    errors.push("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for production sign-in");
  }

  if (values.STORAGE_PROVIDER === "r2") {
    for (const key of R2_KEYS) {
      if (isMissing(values[key])) errors.push(`${key} is required when STORAGE_PROVIDER=r2`);
    }
    if (!isHttpsUrl(values.R2_ENDPOINT)) errors.push("R2_ENDPOINT must be an HTTPS URL");
  }

  if (values.TRANSLATION_PROVIDER === "libretranslate" && isMissing(values.LIBRETRANSLATE_URL)) {
    errors.push("LIBRETRANSLATE_URL is required when TRANSLATION_PROVIDER=libretranslate");
  }

  for (const key of ["OPENALEX_MAILTO", "CROSSREF_MAILTO"] as const) {
    const value = values[key]?.trim();
    if (value && !isEmail(value)) errors.push(`${key} must be a valid email address`);
  }

  return [...new Set(errors)];
}
