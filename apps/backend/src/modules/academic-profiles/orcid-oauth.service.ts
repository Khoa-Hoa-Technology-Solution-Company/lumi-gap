import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type {
  AcademicIdentityConnectionMethod,
  AcademicIdentityLink,
  AcademicIdentityProvider,
  AcademicIdentityStatus,
  AcademicIdentityVerificationStatus,
  AcademicIdentityVisibility,
  OrcidConnectCompleteResponse,
  OrcidConnectionStatus,
  OrcidConnectStartResponse,
  OrcidEnvironment,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { redis } from "../../infrastructure/redis.js";
import { auditService } from "../audit/audit.service.js";
import { resolveOAuthReturnOrigin } from "../auth/google-oidc.service.js";
import { mapAcademicIdentity } from "./academic-identity.service.js";
import { isValidOrcid } from "./dto/academic-profile.schema.js";

const STATE_TTL_SECONDS = 10 * 60;
const ORCID_HTTP_TIMEOUT_MS = 15_000;
const MAX_ORCID_RESPONSE_BYTES = 65_536;

export const ALLOWED_ORCID_BASE_URLS = new Set([
  "https://sandbox.orcid.org",
  "https://orcid.org",
] as const);

const ALLOWED_RETURN_PATHS = new Set([
  "/profile",
  "/profile?edit=link",
  "/settings/profile",
  "/onboarding/academic-profile",
]);

const SavedOrcidStateSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().min(1).max(200).optional(),
  returnOrigin: z.string().url(),
  returnTo: z.string().min(1).max(200),
});

const OrcidTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  name: z.string().nullable().optional(),
  orcid: z.string().min(1),
});

type IdentityRow = {
  id: string;
  userId: string;
  provider: AcademicIdentityProvider;
  label: string | null;
  identifier: string | null;
  profileUrl: string | null;
  connectionMethod: AcademicIdentityConnectionMethod;
  status: AcademicIdentityStatus;
  verificationStatus: AcademicIdentityVerificationStatus;
  visibility: AcademicIdentityVisibility;
  createdAt: Date;
  updatedAt: Date;
};

function stateKey(state: string): string {
  return `oauth:orcid:state:${createHash("sha256").update(state).digest("hex")}`;
}

export function resolveOrcidBaseUrl(rawBaseUrl = env.ORCID_BASE_URL): {
  baseUrl: "https://sandbox.orcid.org" | "https://orcid.org";
  environment: OrcidEnvironment;
} {
  const normalized = (rawBaseUrl ?? "https://sandbox.orcid.org").trim().replace(/\/+$/, "");
  if (normalized !== "https://sandbox.orcid.org" && normalized !== "https://orcid.org") {
    throw AppError.serviceUnavailable("ORCID base URL is invalid or not allowed");
  }
  return {
    baseUrl: normalized,
    environment: normalized === "https://orcid.org" ? "production" : "sandbox",
  };
}

export function isValidOrcidRedirectUri(redirectUri?: string): boolean {
  if (!redirectUri || !redirectUri.trim()) return false;
  try {
    const parsed = new URL(redirectUri.trim());
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    if (parsed.protocol === "https:") return true;
    if (
      env.NODE_ENV !== "production" &&
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function getOrcidConfig(): {
  configured: boolean;
  environment: OrcidEnvironment;
  baseUrl: "https://sandbox.orcid.org" | "https://orcid.org";
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
} {
  let baseUrl: "https://sandbox.orcid.org" | "https://orcid.org" = "https://sandbox.orcid.org";
  let environment: OrcidEnvironment = "sandbox";
  let baseUrlValid = true;
  try {
    const resolved = resolveOrcidBaseUrl(env.ORCID_BASE_URL);
    baseUrl = resolved.baseUrl;
    environment = resolved.environment;
  } catch {
    baseUrlValid = false;
  }

  const clientId = env.ORCID_CLIENT_ID?.trim() || undefined;
  const clientSecret = env.ORCID_CLIENT_SECRET?.trim() || undefined;
  const redirectUri = env.ORCID_REDIRECT_URI?.trim() || undefined;
  const configured = Boolean(
    baseUrlValid &&
    clientId &&
    clientSecret &&
    redirectUri &&
    isValidOrcidRedirectUri(redirectUri),
  );

  return {
    configured,
    environment,
    baseUrl,
    clientId,
    clientSecret,
    redirectUri,
  };
}

function requireConfiguredOrcid(): {
  environment: OrcidEnvironment;
  baseUrl: "https://sandbox.orcid.org" | "https://orcid.org";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const resolved = resolveOrcidBaseUrl(env.ORCID_BASE_URL);
  const clientId = env.ORCID_CLIENT_ID?.trim();
  const clientSecret = env.ORCID_CLIENT_SECRET?.trim();
  const redirectUri = env.ORCID_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri || !isValidOrcidRedirectUri(redirectUri)) {
    throw AppError.serviceUnavailable("ORCID connection is not configured");
  }

  return {
    environment: resolved.environment,
    baseUrl: resolved.baseUrl,
    clientId,
    clientSecret,
    redirectUri,
  };
}

export function sanitizeOrcidReturnTo(candidate?: string): string {
  if (!candidate) return "/profile";
  const trimmed = candidate.trim();
  if (ALLOWED_RETURN_PATHS.has(trimmed)) return trimmed;
  return "/profile";
}

export function normalizeOrcidIdentifier(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(?:sandbox\.)?orcid\.org\//i, "")
    .replace(/\/+$/, "")
    .toUpperCase();
}

export function canonicalOrcidProfileUrl(orcidId: string): string {
  return `https://orcid.org/${orcidId}`;
}

async function resolveActiveUser(userId: string, db = getPrisma()) {
  const parsed = parseDatabaseId(userId);
  if (!parsed) throw AppError.notFound("Academic identity owner not found");
  const user = await db.user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
    select: { id: true, accountStatus: true },
  });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw AppError.notFound("Academic identity owner not found");
  }
  return user;
}

async function ensureActiveSession(
  userId: string,
  sessionId: string | undefined,
  db: {
    refreshToken?: {
      findFirst: (args: {
        where: {
          userId: string;
          familyId: string;
          revokedAt: null;
          expiresAt: { gt: Date };
        };
        select: { id: true };
      }) => Promise<{ id: string } | null>;
    };
  },
) {
  if (!sessionId || !db.refreshToken?.findFirst) return;
  const activeSession = await db.refreshToken.findFirst({
    where: {
      userId,
      familyId: sessionId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!activeSession) {
    throw AppError.unauthorized("Your LumiGap session is no longer active. Please sign in and try again.");
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_ORCID_RESPONSE_BYTES) {
      throw AppError.badGateway("ORCID response exceeded size limit");
    }
    return text;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ORCID_RESPONSE_BYTES) {
      await reader.cancel();
      throw AppError.badGateway("ORCID response exceeded size limit");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002",
  );
}

async function exchangeAuthorizationCode(
  config: {
    baseUrl: "https://sandbox.orcid.org" | "https://orcid.org";
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
  code: string,
): Promise<{ orcid: string; name?: string }> {
  const tokenUrl = new URL("/oauth/token", config.baseUrl);
  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(ORCID_HTTP_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badGateway("Unable to reach ORCID authorization service");
  }

  const rawBody = await readBoundedText(response);
  let jsonBody: unknown;
  try {
    jsonBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    throw AppError.badGateway("ORCID returned an invalid response");
  }

  if (!response.ok) {
    const oauthError = jsonBody && typeof jsonBody === "object" && "error" in jsonBody
      ? String((jsonBody as { error?: unknown }).error)
      : "";
    if (oauthError === "invalid_grant") {
      throw AppError.badRequest("ORCID authorization code is invalid or expired");
    }
    throw AppError.badGateway("ORCID token exchange failed");
  }

  const parsedToken = OrcidTokenResponseSchema.safeParse(jsonBody);
  if (!parsedToken.success) {
    throw AppError.badGateway("ORCID token response is missing required identity fields");
  }

  const normalizedOrcid = normalizeOrcidIdentifier(parsedToken.data.orcid);
  if (!isValidOrcid(normalizedOrcid)) {
    throw AppError.badGateway("ORCID returned an invalid researcher identifier");
  }

  return {
    orcid: normalizedOrcid,
    name: parsedToken.data.name?.trim() || undefined,
  };
}

export const orcidOAuthService = {
  async status(userId: string): Promise<OrcidConnectionStatus> {
    const user = await resolveActiveUser(userId);
    const config = getOrcidConfig();
    const row = await getPrisma().academicIdentityLink.findFirst({
      where: { userId: user.id, provider: "ORCID" },
    }) as IdentityRow | null;
    const link = row ? mapAcademicIdentity(row) : null;
    const connected = Boolean(
      link &&
      link.connectionMethod === "OAUTH" &&
      link.status === "CONNECTED" &&
      link.verificationStatus === "PROVIDER_CONNECTED" &&
      link.identifier &&
      isValidOrcid(link.identifier),
    );
    return {
      configured: config.configured,
      environment: config.environment,
      connected,
      link,
    };
  },

  async start(
    userId: string,
    sessionId?: string,
    options?: { returnTo?: string; returnOrigin?: string },
  ): Promise<OrcidConnectStartResponse> {
    const user = await resolveActiveUser(userId);
    const config = requireConfiguredOrcid();
    await ensureActiveSession(user.id, sessionId, getPrisma());

    const returnOrigin = resolveOAuthReturnOrigin(options?.returnOrigin);
    const returnTo = sanitizeOrcidReturnTo(options?.returnTo);
    const state = randomBytes(32).toString("base64url");

    const stored = await redis.set(
      stateKey(state),
      JSON.stringify({
        userId: user.id,
        ...(sessionId ? { sessionId } : {}),
        returnOrigin,
        returnTo,
      }),
      "EX",
      STATE_TTL_SECONDS,
      "NX",
    );
    if (stored !== "OK") {
      throw AppError.serviceUnavailable("Unable to initialize ORCID authorization state");
    }

    const authorizeUrl = new URL("/oauth/authorize", config.baseUrl);
    authorizeUrl.searchParams.set("client_id", config.clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "/authenticate");
    authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
    authorizeUrl.searchParams.set("state", state);

    return {
      url: authorizeUrl.toString(),
      state,
    };
  },

  async complete(input: {
    code?: string;
    state?: string;
    error?: string;
    errorDescription?: string;
    authenticatedUserId?: string;
    authenticatedSessionId?: string;
  }): Promise<OrcidConnectCompleteResponse & { returnOrigin: string }> {
    const config = requireConfiguredOrcid();

    let consumedState: z.infer<typeof SavedOrcidStateSchema> | null = null;
    if (input.state && input.state.trim().length >= 20) {
      const key = stateKey(input.state.trim());
      const raw = await redis.get(key);
      if (raw) {
        const deleted = await redis.eval(
          "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
          1,
          key,
          raw,
        );
        if (deleted === 1) {
          const parsed = SavedOrcidStateSchema.safeParse(
            (() => {
              try {
                return JSON.parse(raw);
              } catch {
                return null;
              }
            })(),
          );
          if (parsed.success) {
            consumedState = parsed.data;
          }
        }
      }
    }

    if (input.error) {
      const message = input.error === "access_denied"
        ? "ORCID authorization was cancelled"
        : "ORCID authorization could not be completed";
      const err = AppError.badRequest(message, {
        providerError: input.error,
        returnOrigin: consumedState?.returnOrigin ?? resolveOAuthReturnOrigin(),
        returnTo: consumedState?.returnTo ?? "/profile",
      });
      throw err;
    }

    if (!input.code?.trim() || !input.state?.trim()) {
      throw AppError.badRequest("Missing ORCID authorization code or state");
    }

    if (!consumedState) {
      throw AppError.badRequest("ORCID authorization state is invalid, expired, or already used");
    }

    const prisma = getPrisma();

    if (input.authenticatedUserId) {
      const caller = await resolveActiveUser(input.authenticatedUserId, prisma);
      if (caller.id !== consumedState.userId) {
        throw AppError.forbidden("ORCID authorization state belongs to a different LumiGap account");
      }
      if (
        consumedState.sessionId &&
        input.authenticatedSessionId &&
        consumedState.sessionId !== input.authenticatedSessionId
      ) {
        throw AppError.forbidden("ORCID authorization state belongs to a different session");
      }
    }

    await resolveActiveUser(consumedState.userId, prisma);
    await ensureActiveSession(consumedState.userId, consumedState.sessionId, prisma);

    const exchanged = await exchangeAuthorizationCode(config, input.code.trim());
    const profileUrl = canonicalOrcidProfileUrl(exchanged.orcid);

    const runPersistence = async (tx: typeof prisma) => {
      if (typeof tx.$queryRaw === "function") {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${consumedState.userId} FOR UPDATE`;
      }
      const user = await resolveActiveUser(consumedState.userId, tx);
      await ensureActiveSession(user.id, consumedState.sessionId, tx);

      const conflictingVerifiedLink = await tx.academicIdentityLink.findFirst({
        where: {
          provider: "ORCID",
          identifier: exchanged.orcid,
          verificationStatus: "PROVIDER_CONNECTED",
          userId: { not: user.id },
        },
      });
      if (conflictingVerifiedLink) {
        throw AppError.conflict("This ORCID iD is already connected to another LumiGap account");
      }

      const existingOwnLink = await tx.academicIdentityLink.findFirst({
        where: {
          userId: user.id,
          provider: "ORCID",
        },
      }) as IdentityRow | null;

      let persisted: IdentityRow;
      const upgradedFromManual = Boolean(
        existingOwnLink && existingOwnLink.verificationStatus !== "PROVIDER_CONNECTED",
      );

      if (existingOwnLink) {
        persisted = await tx.academicIdentityLink.update({
          where: { id: existingOwnLink.id },
          data: {
            identifier: exchanged.orcid,
            profileUrl,
            connectionMethod: "OAUTH",
            status: "CONNECTED",
            verificationStatus: "PROVIDER_CONNECTED",
          },
        }) as IdentityRow;
      } else {
        persisted = await tx.academicIdentityLink.create({
          data: {
            userId: user.id,
            provider: "ORCID",
            identifier: exchanged.orcid,
            profileUrl,
            connectionMethod: "OAUTH",
            status: "CONNECTED",
            verificationStatus: "PROVIDER_CONNECTED",
            visibility: "PUBLIC",
          },
        }) as IdentityRow;
      }

      if (tx.academicProfile?.updateMany) {
        await tx.academicProfile.updateMany({
          where: { userId: user.id },
          data: { orcidStatus: "VERIFIED" },
        });
      }

      return { persisted, upgradedFromManual, userId: user.id };
    };

    let result: Awaited<ReturnType<typeof runPersistence>>;
    try {
      result = typeof prisma.$transaction === "function"
        ? await prisma.$transaction((tx) => runPersistence(tx as typeof prisma))
        : await runPersistence(prisma);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppError.conflict("This ORCID iD is already connected to another LumiGap account");
      }
      throw error;
    }

    await auditService.log("academic_profile.orcid.connected", {
      userId: result.userId,
      targetTableName: "academic_identity_links",
      targetRecordId: result.persisted.id,
      details: {
        provider: "ORCID",
        identifier: exchanged.orcid,
        environment: config.environment,
        connectionMethod: "OAUTH",
        verificationStatus: "PROVIDER_CONNECTED",
        upgradedFromManual: result.upgradedFromManual,
      },
    });

    return {
      link: mapAcademicIdentity(result.persisted),
      returnTo: consumedState.returnTo,
      returnOrigin: consumedState.returnOrigin,
    };
  },

  async disconnect(userId: string): Promise<{ disconnected: true }> {
    const prisma = getPrisma();
    const user = await resolveActiveUser(userId, prisma);
    const existing = await prisma.academicIdentityLink.findFirst({
      where: { userId: user.id, provider: "ORCID" },
    }) as IdentityRow | null;

    if (!existing) {
      throw AppError.notFound("ORCID identity link not found");
    }

    const runDelete = async (tx: typeof prisma) => {
      await tx.academicIdentityLink.delete({ where: { id: existing.id } });
      if (tx.academicProfile?.updateMany) {
        await tx.academicProfile.updateMany({
          where: { userId: user.id },
          data: { orcidStatus: "NOT_SUBMITTED" },
        });
      }
    };

    if (typeof prisma.$transaction === "function") {
      await prisma.$transaction((tx) => runDelete(tx as typeof prisma));
    } else {
      await runDelete(prisma);
    }

    await auditService.log("academic_profile.orcid.disconnected", {
      userId: user.id,
      targetTableName: "academic_identity_links",
      targetRecordId: existing.id,
      details: {
        provider: "ORCID",
        identifier: existing.identifier,
        previousVerificationStatus: existing.verificationStatus,
      },
    });

    return { disconnected: true };
  },
};

