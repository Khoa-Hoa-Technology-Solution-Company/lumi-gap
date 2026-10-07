import { backendRoot } from "./load-env.js";
import { resolve } from "node:path";
import { z } from "zod";

const optionalEnvString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());
const optionalEnvEmail = z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional());
const optionalEnvUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());
const optionalPostgresUri = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url("DATABASE_URL must be a valid URL; use alphanumeric passwords for local setup").refine(
    (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "DATABASE_URL must be a PostgreSQL connection URL",
  ).optional(),
);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ORIGIN: z.string().default("http://localhost:3000,http://localhost:5173"),

  DATABASE_URL: optionalPostgresUri,
  PERSISTENCE_PROVIDER: z.literal("postgresql").default("postgresql"),
  MIGRATION_BATCH_SIZE: z.coerce.number().int().min(10).max(5000).default(500),

  REDIS_URL: z.string().url().or(z.string().startsWith("redis")),

  // Binary storage. local keeps the existing development behavior; r2 stores
  // PDFs/images in Cloudflare R2 via the S3-compatible API; cloudinary stores
  // profile media and PDF/document artifacts in Cloudinary.
  STORAGE_PROVIDER: z.enum(["local", "r2", "cloudinary"]).default("local"),
  R2_ENDPOINT: optionalEnvUrl,
  R2_ACCESS_KEY_ID: optionalEnvString,
  R2_SECRET_ACCESS_KEY: optionalEnvString,
  R2_BUCKET: optionalEnvString,
  R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  CLOUDINARY_CLOUD_NAME: optionalEnvString,
  CLOUDINARY_API_KEY: optionalEnvString,
  CLOUDINARY_API_SECRET: optionalEnvString,

  // RS256 access tokens. Private keys are never committed; local development
  // uses ignored PEM files under apps/backend/.keys.
  JWT_ALGORITHM: z.literal("RS256").default("RS256"),
  JWT_PRIVATE_KEY_PATH: z.string().default(".keys/jwt-private.pem").transform((value) => resolve(backendRoot, value)),
  JWT_PUBLIC_KEY_PATH: z.string().default(".keys/jwt-public.pem").transform((value) => resolve(backendRoot, value)),
  JWT_ISSUER: z.string().min(1).default("lumigap-api"),
  JWT_AUDIENCE: z.string().min(1).default("lumigap-web"),
  // Deprecated HMAC secrets remain optional during the migration window. They
  // are not used to sign or verify access/refresh tokens.
  JWT_ACCESS_SECRET: optionalEnvString,
  JWT_REFRESH_SECRET: optionalEnvString,
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().default("http://localhost:4000/api/v1/auth/google/callback"),

  // Transactional email for security-sensitive verification messages. "log" is
  // an explicit local-development transport and is forbidden in production.
  EMAIL_DELIVERY_MODE: z.enum(["disabled", "log", "smtp"]).default("disabled"),
  SMTP_HOST: optionalEnvString,
  SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SMTP_USER: optionalEnvString,
  SMTP_PASS: optionalEnvString,
  SMTP_FROM: optionalEnvEmail,
  ACADEMIC_EMAIL_OTP_SECRET: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional(),
  ),

  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com"),
  AI_CONNECTION_ENCRYPTION_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().min(32).optional()),
  AI_ALLOWED_BASE_URLS: z.string().default(""),
  AI_ALLOW_LOCAL_ENDPOINTS: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  AI_LOCALHOST_HOST: z.string().regex(/^(?:[a-zA-Z0-9.-]+)?$/, "AI_LOCALHOST_HOST must be a hostname without a port or path").default(""),
  // Keep generative models configurable as provider availability changes.
  // Embeddings use their own model; changing these preserves existing vectors.
  GEMINI_MODEL_FAST: z.string().default("gemini-3.1-flash-lite"),
  GEMINI_MODEL_DEEP: z.string().default("gemini-3.1-flash-lite"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-2"),
  GEMINI_EMBEDDING_VERSION: z.string().min(1).default("1"),
  GEMINI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),

  // Project Chat — only the project chatbot uses this pluggable provider for now.
  LLM_PROVIDER: z.enum(["gemini", "ollama"]).default("gemini"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("llama3.1"),
  // On-demand Paper Detail translation. Defaults to gemini (using GEMINI_API_KEY).
  TRANSLATION_PROVIDER: z.enum(["disabled", "libretranslate", "gemini"]).default("gemini"),
  LIBRETRANSLATE_URL: z.string().url().default("http://localhost:5000"),
  LIBRETRANSLATE_API_KEY: optionalEnvString,
  // Internal AI Reviewer service (Python FastAPI)
  AI_REVIEWER_URL: z.string().url().default("http://localhost:8001"),
  INTERNAL_SERVICE_KEY: z.string().min(32, "INTERNAL_SERVICE_KEY must contain at least 32 characters"),
  // PayOS Payment Integration
  PAYOS_CLIENT_ID: optionalEnvString,
  PAYOS_API_KEY: optionalEnvString,
  PAYOS_CHECKSUM_KEY: optionalEnvString,
  CREDIT_PRICE_VND: z.coerce.number().int().positive().default(100),
  MIN_TOPUP_VND: z.coerce.number().int().positive().default(10000),
  TRANSLATION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  TRANSLATION_MAX_PER_HOUR: z.coerce.number().int().positive().default(30),
  CHAT_MAX_PER_HOUR: z.coerce.number().int().positive().default(40),
  TEAM_CHAT_MAX_PER_MINUTE: z.coerce.number().int().positive().default(20),
  CHAT_CONTEXT_PAPERS: z.coerce.number().int().min(1).max(50).default(12),
  CHAT_HISTORY_TURNS: z.coerce.number().int().min(0).max(20).default(6),
  CHAT_MAX_PROMPT_CHARS: z.coerce.number().int().positive().default(12000),
  CHAT_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  CHAT_ABSTRACT_MAX_CHARS: z.coerce.number().int().positive().default(800),

  // Forum Trust & Safety policy knobs. Defaults are development-safe values;
  // production values must be confirmed by FPT/policy owners before launch.
  FORUM_APPEAL_SUBMISSION_WINDOW_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  FORUM_MODERATION_CLAIM_LEASE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  FORUM_MODERATION_EVIDENCE_RETENTION_DAYS: z.coerce.number().int().min(1).max(36500).default(365),
  FORUM_AUDIT_METADATA_RETENTION_DAYS: z.coerce.number().int().min(1).max(36500).default(3650),
  FORUM_MAX_PINNED_THREADS_PER_COMMUNITY: z.coerce.number().int().min(1).max(100).default(10),
  FORUM_COPYRIGHT_EMAIL_VERIFICATION_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  FORUM_RATE_LIMIT_UNVERIFIED: z.coerce.number().int().min(1).max(1000).default(10),
  FORUM_RATE_LIMIT_VERIFIED: z.coerce.number().int().min(1).max(5000).default(60),
  FORUM_COPYRIGHT_PUBLIC_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(3),
  FORUM_ALLOW_SOLE_ADMIN_APPEAL_REVIEW: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),

  OPENALEX_MAILTO: optionalEnvEmail,
  // The normal application can read the existing corpus without an OpenAlex
  // key. Treat an empty Compose/.env value as absent; the scale-campaign start
  // endpoint performs the explicit key-required check before a provider call.
  OPENALEX_API_KEY: optionalEnvString,
  SEMANTIC_SCHOLAR_API_KEY: z.string().optional(),
  CROSSREF_MAILTO: optionalEnvEmail,

  SYNC_CRON: z.string().default("0 2 * * *"),
  // OpenAlex Works list requests currently allow at most 100 results/page.
  // Keep this bound in configuration as well as the provider adapter.
  SYNC_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(100),
  SYNC_MAX_PAGES_PER_RUN: z.coerce.number().int().positive().default(10),
  // Store the full provider JSON (rawMetadata) on each source record. It is HEAVY
  // (50-300 KB/paper) and read by nothing — default OFF to protect Atlas M0 (512 MB).
  SYNC_STORE_RAW_METADATA: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Million-scale campaign worker. These values are intentionally conservative;
  // a campaign must be explicitly planned and started by an admin.
  OPENALEX_INGEST_LEASE_SECONDS: z.coerce.number().int().min(30).max(3600).default(180),
  OPENALEX_INGEST_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),

  // Phase B — embedding worker.
  EMBED_CRON: z.string().default("0 3 * * *"),
  EMBED_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  EMBED_MAX_PAPERS_PER_RUN: z.coerce.number().int().positive().default(1000),

  // F2 — structured paper knowledge extraction. Runs offline in a worker so
  // user-facing search/chat/report requests never wait on one-call-per-paper LLM work.
  PAPER_ANALYSIS_CRON: z.string().default("0 4 * * *"),
  PAPER_ANALYSIS_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  PAPER_ANALYSIS_MAX_PAPERS_PER_RUN: z.coerce.number().int().positive().default(100),
  PAPER_ANALYSIS_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1024),
  RAG_MAX_CHUNKS: z.coerce.number().int().min(1).max(400).default(300),
  RAG_CHUNK_CHARS: z.coerce.number().int().min(500).max(4000).default(2400),
  RAG_PASSAGES_PER_PAPER: z.coerce.number().int().min(1).max(5).default(3),

  // Phase C — RAG analytical reports.
  REPORT_TOP_K: z.coerce.number().int().min(1).max(10).default(8),
  REPORT_MAX_PENDING_PER_USER: z.coerce.number().int().positive().default(2),
  REPORT_MAX_PER_HOUR: z.coerce.number().int().positive().default(10),
  REPORT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(8192),

  // Phase D — Research Gaps
  GAPS_TOP_K: z.coerce.number().int().min(3).max(10).default(10),
  GAPS_MAX_PER_HOUR: z.coerce.number().int().positive().default(10),
  GAPS_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(2048),
  // v2 — a gap is "confirmed" when its intersection is scarce AND a parent topic
  // is rising. Scarce = intersectionCount ≤ GAP_SCARCE_ABS OR ≤ GAP_SCARCE_PCT × min(parentCounts).
  GAP_SCARCE_ABS: z.coerce.number().int().nonnegative().default(5),
  GAP_SCARCE_PCT: z.coerce.number().min(0).max(1).default(0.02),
  GAP_PARENT_RISING_MIN: z.coerce.number().default(0), // growthRatePct strictly above this = rising
  // v2 — paper comparison (one cached LLM call; capped to bound tokens).
  COMPARE_MAX_PAPERS: z.coerce.number().int().min(2).max(4).default(4),
  COMPARE_PROMPT_VERSION: z.string().default("compare-v2"),
  COMPARE_MAX_PER_HOUR: z.coerce.number().int().positive().default(20),
  // Phase D — Function Calling
  DEEP_ANALYSIS_MAX_TURNS: z.coerce.number().int().min(1).max(10).default(5),
  DEEP_ANALYSIS_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(8192),

  // Cách 2 — server-side search filters. When post-vector filters (paperKind,
  // openAccess, provider, minScore) are applied to a semantic search, we pull a
  // larger candidate POOL from $vectorSearch first, then filter/sort/paginate
  // over it. Bounded on purpose: $vectorSearch is top-K by similarity, so this
  // is the honest ceiling of results for a single query.
  SEARCH_FILTER_POOL: z.coerce.number().int().min(50).max(1000).default(200),

  // Phase B/C — LLM re-rank of semantic search. Size of the candidate pool the
  // LLM re-scores (bounded — re-ranking refines the head of the results).
  RERANK_CANDIDATES: z.coerce.number().int().min(2).max(50).default(20),
  // Per-IP cap on rerank=true (the LLM path) — /search is public, so this
  // throttle stops an unauthenticated loop from draining the Gemini quota.
  RERANK_MAX_PER_HOUR: z.coerce.number().int().positive().default(30),
  SEMANTIC_SEARCH_MAX_PER_MINUTE: z.coerce.number().int().positive().default(60),
  // Community "did you mean" suggestions embed the raw query on every cache miss
  // (Gemini, shared quota), so the route is throttled per user/IP.
  COMMUNITY_SUGGEST_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(20),
  // Minimum similarity for a semantic community match. Score = 1 - cosine_distance / 2,
  // i.e. (1 + cos) / 2, so 0.75 corresponds to a cosine of 0.5. Tune on real embeddings.
  COMMUNITY_SUGGEST_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.75),

  // Quality & Feedback — per-user/hour cap on the on-demand LLM-judge (a generate call).
  QUALITY_EVAL_MAX_PER_HOUR: z.coerce.number().int().positive().default(20),

  // Research directions — per-user/hour cap on the on-demand "suggest directions" LLM call.
  DIRECTIONS_MAX_PER_HOUR: z.coerce.number().int().positive().default(20),

  // DEV ONLY: when "true", the /api/v1/admin/sync endpoints skip auth so the
  // team can demo before an admin user is seeded. Never enable in production.
  // (Plain z.coerce.boolean() is unsafe — "false" would coerce to true — so we
  //  parse an explicit "true"/"false" string instead.)
  SYNC_ADMIN_BYPASS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  INITIAL_USER_CREDITS: z.coerce.number().int().nonnegative().default(1000),
}).superRefine((value, ctx) => {
  if (!value.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "DATABASE_URL is required for the PostgreSQL runtime",
    });
  }
  if (value.NODE_ENV !== "test" && value.PERSISTENCE_PROVIDER !== "postgresql") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PERSISTENCE_PROVIDER"],
      message: "Only PostgreSQL is allowed for the application runtime",
    });
  }

  if (value.STORAGE_PROVIDER === "r2") {
    for (const key of ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_PROVIDER=r2`,
        });
      }
    }
  }
  if (value.STORAGE_PROVIDER === "cloudinary") {
    for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_PROVIDER=cloudinary`,
        });
      }
    }
  }

  if (value.EMAIL_DELIVERY_MODE === "smtp") {
    for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when EMAIL_DELIVERY_MODE=smtp`,
        });
      }
    }
  }

  if (value.NODE_ENV === "production") {
    for (const [key, rawValue] of Object.entries(value)) {
      if (typeof rawValue === "string" && /^<[^>]+>$/.test(rawValue.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} still contains a template placeholder`,
        });
      }
    }
    if (value.SYNC_ADMIN_BYPASS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SYNC_ADMIN_BYPASS"],
        message: "SYNC_ADMIN_BYPASS must be false in production",
      });
    }
    if (value.EMAIL_DELIVERY_MODE === "log") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EMAIL_DELIVERY_MODE"],
        message: "EMAIL_DELIVERY_MODE=log is forbidden in production",
      });
    }
  }
});

const rawEnv = { ...process.env };

// Inject mock defaults under Vitest ONLY to avoid process.exit(1) on missing secrets.
// SECURITY: gated on VITEST (which Vitest sets automatically), NOT on NODE_ENV — a
// production deploy mis-set to NODE_ENV=test must NOT silently boot with the hardcoded
// mock JWT secrets (which are committed to this PUBLIC repo) and let anyone forge tokens.
if (rawEnv.VITEST === "true") {
  rawEnv.NODE_ENV = "test";
  rawEnv.PERSISTENCE_PROVIDER = "postgresql";
  rawEnv.REDIS_URL = rawEnv.REDIS_URL || "redis://localhost:6379";
  rawEnv.DATABASE_URL = rawEnv.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
  rawEnv.STORAGE_PROVIDER = "local";
  rawEnv.GEMINI_API_KEY = rawEnv.GEMINI_API_KEY || "mock-gemini-key";
  rawEnv.INTERNAL_SERVICE_KEY = rawEnv.INTERNAL_SERVICE_KEY || "mock-internal-service-key-32-characters";
}

const parsed = EnvSchema.safeParse(rawEnv);
if (!parsed.success) {
  // Print a loud banner so the user does not miss this in the terminal.
  // We don't throw — a stack trace is noise for config problems, and a
  // boxed banner is easier to spot than a one-line Pino log.
  console.error("");
  console.error("  ┌──────────────────────────────────────────────────────────┐");
  console.error("  │  ❌  Cannot start backend — invalid .env                 │");
  console.error("  │                                                          │");
  for (const issue of parsed.error.issues) {
    const msg = `     - ${issue.path.join(".")}: ${issue.message}`;
    console.error(`  │${msg.padEnd(58)}│`);
  }
  console.error("  │                                                          │");
  console.error("  │  Fix root .env then re-run pnpm dev:backend              │");
  console.error("  └──────────────────────────────────────────────────────────┘");
  console.error("");
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
