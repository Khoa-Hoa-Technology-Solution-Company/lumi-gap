import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { GithubConnectionStatus, GithubRepositories } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { redis } from "../../infrastructure/redis.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { openGithubToken, sealGithubToken } from "./github.crypto.js";
import { GithubHttpError, githubJson } from "./github.http.js";
import { githubCreateRepoSchema, githubRequestSchema, githubReturnPath, type GithubRequest } from "./github.schema.js";
import { logger } from "../../infrastructure/logger.js";
import { assertCanExportProjectSource, researchLedgerService } from "../audit/research-ledger.service.js";

const tokenSchema = z.object({ access_token: z.string().min(1).max(2048), token_type: z.literal("bearer"), expires_in: z.number().int().positive().max(31_536_000).optional(), refresh_token: z.string().min(1).max(2048).optional(), refresh_token_expires_in: z.number().int().positive().max(31_536_000).optional() });
const stateSchema = z.object({ userId: z.string().uuid(), sessionId: z.string(), verifier: z.string(), revision: z.number().int(), returnTo: z.string() });
const stateKey = (state: string) => `oauth:github:state:${createHash("sha256").update(state).digest("hex")}`;
function configured() {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw AppError.serviceUnavailable("GitHub connection is not configured");
  return { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
}
async function actor(input: string) {
  const id = parseDatabaseId(input);
  const user = id && await getPrisma().user.findUnique({ where: id.kind === "uuid" ? { id: id.value } : { legacyMongoId: id.value }, select: { id: true, isActive: true, accountStatus: true } });
  if (!user || !user.isActive || user.accountStatus !== "ACTIVE") throw AppError.unauthorized();
  return user.id;
}
function credentials(value: z.infer<typeof tokenSchema>, userId: string) {
  return {
    encryptedAccessToken: sealGithubToken(value.access_token, userId),
    encryptedRefreshToken: value.refresh_token ? sealGithubToken(value.refresh_token, userId) : null,
    expiresAt: value.expires_in ? new Date(Date.now() + value.expires_in * 1000) : null,
    refreshExpiresAt: value.refresh_token_expires_in ? new Date(Date.now() + value.refresh_token_expires_in * 1000) : null,
  };
}
async function exchange(params: Record<string, string>) {
  const { clientId, clientSecret } = configured();
  const result = await githubJson("https://github.com/login/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }) }, 16384);
  const parsed = tokenSchema.safeParse(result);
  if (!parsed.success) throw AppError.forbidden("GitHub authorization expired or was declined; reconnect GitHub");
  return parsed.data;
}
const apiHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" });
const cleared = { encryptedAccessToken: null, encryptedRefreshToken: null, expiresAt: null, refreshExpiresAt: null, githubUserId: null, login: null };

async function accessToken(userId: string) {
  const db = getPrisma(), current = await db.githubConnection.findUnique({ where: { userId } });
  if (!current?.encryptedAccessToken) throw AppError.forbidden("Connect GitHub before synchronizing");
  if (!current.expiresAt || current.expiresAt.getTime() > Date.now() + 60000) return { token: openGithubToken(current.encryptedAccessToken, userId), encrypted: current.encryptedAccessToken };
  // A refresh token rotates on use. Serialize across API instances, not just this process.
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT user_id FROM github_connections WHERE user_id = ${userId}::uuid FOR UPDATE`;
    const row = await tx.githubConnection.findUnique({ where: { userId } });
    if (!row?.encryptedAccessToken) return null;
    if (!row.expiresAt || row.expiresAt.getTime() > Date.now() + 60000) return { token: openGithubToken(row.encryptedAccessToken, userId), encrypted: row.encryptedAccessToken };
    if (!row.encryptedRefreshToken || row.refreshExpiresAt && row.refreshExpiresAt.getTime() <= Date.now()) {
      await tx.githubConnection.update({ where: { userId }, data: { ...cleared, revision: { increment: 1 } } }); return null;
    }
    let value;
    try { value = await exchange({ grant_type: "refresh_token", refresh_token: openGithubToken(row.encryptedRefreshToken, userId) }); }
    catch (error) {
      if (error instanceof AppError && error.statusCode === 403 || error instanceof GithubHttpError && [400, 401].includes(error.status)) {
        await tx.githubConnection.update({ where: { userId }, data: { ...cleared, revision: { increment: 1 } } }); return null;
      }
      throw error;
    }
    const data = credentials(value, userId);
    await tx.githubConnection.update({ where: { userId }, data: { ...data, revision: { increment: 1 } } });
    return { token: value.access_token, encrypted: data.encryptedAccessToken };
  }, { timeout: 25000, maxWait: 20000 });
  if (!result) throw AppError.forbidden("GitHub authorization expired; reconnect GitHub");
  return result;
}
async function provider(userId: string, path: string, method = "GET", body?: unknown) {
  const access = await accessToken(userId);
  try { return await githubJson(`https://api.github.com${path}`, { method, headers: { ...apiHeaders(access.token), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); }
  catch (error) {
    if (!(error instanceof GithubHttpError)) throw error;
    if (error.status === 401) {
      await getPrisma().githubConnection.updateMany({ where: { userId, encryptedAccessToken: access.encrypted }, data: { ...cleared, revision: { increment: 1 } } });
      throw AppError.forbidden("GitHub authorization revoked; reconnect GitHub");
    }
    if (error.rateLimited) throw AppError.tooMany("GitHub rate limit reached");
    if ([409, 422].includes(error.status)) throw AppError.conflict("GitHub branch changed or is protected");
    if ([403, 404].includes(error.status)) throw AppError.forbidden("GitHub repository access denied; check the app installation and repository permissions");
    throw AppError.serviceUnavailable("GitHub request failed");
  }
}

const repoPrivacyCache = new Map<string, { isPrivate: boolean; expiresAt: number }>();

async function checkRepoPrivacy(userId: string, repository: string): Promise<boolean> {
  const cacheKey = `${userId}:${repository}`;
  const now = Date.now();
  const cached = repoPrivacyCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.isPrivate;
  }
  const repo = await provider(userId, `/repos/${repository}`);
  const parsed = z.object({ private: z.boolean() }).safeParse(repo);
  if (!parsed.success) {
    throw AppError.serviceUnavailable("Unable to verify repository privacy status");
  }
  if (repoPrivacyCache.size > 500) {
    for (const [k, v] of repoPrivacyCache.entries()) {
      if (v.expiresAt <= now) repoPrivacyCache.delete(k);
    }
  }
  repoPrivacyCache.set(cacheKey, { isPrivate: parsed.data.private, expiresAt: now + 60_000 });
  return parsed.data.private;
}

export const githubService = {
  async status(input: string): Promise<GithubConnectionStatus> {
    const userId = await actor(input), row = await getPrisma().githubConnection.findUnique({ where: { userId } });
    const connected = Boolean(row?.encryptedAccessToken && (!row.expiresAt || row.expiresAt.getTime() > Date.now() || row.encryptedRefreshToken && (!row.refreshExpiresAt || row.refreshExpiresAt.getTime() > Date.now())));
    return { configured: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET), connected, login: connected ? row!.login : null, expiresAt: row?.expiresAt?.toISOString() ?? null, installUrl: env.GITHUB_APP_SLUG ? `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new` : null };
  },
  async start(input: string, sessionId: string, returnTo: string) {
    const { clientId } = configured(), userId = await actor(input);
    githubReturnPath.parse(returnTo);
    const row = await getPrisma().githubConnection.upsert({ where: { userId }, create: { userId, revision: 1 }, update: { revision: { increment: 1 } } });
    const state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
    const stored = await redis.set(stateKey(state), JSON.stringify({ userId, sessionId, verifier, returnTo, revision: row.revision }), "EX", 600, "NX");
    if (stored !== "OK") throw AppError.serviceUnavailable("Unable to connect GitHub");
    const url = new URL("https://github.com/login/oauth/authorize");
    for (const [name, value] of Object.entries({ client_id: clientId, redirect_uri: env.GITHUB_CALLBACK_URL, state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", scope: "offline_access" })) url.searchParams.set(name, value);
    return { url: url.toString() };
  },
  async complete(input: string, sessionId: string, code: string, state: string) {
    const userId = await actor(input), raw = await redis.get(stateKey(state));
    let stored: unknown;
    try { stored = raw ? JSON.parse(raw) : null; } catch { stored = null; }
    const parsed = stateSchema.safeParse(stored);
    if (!parsed.success || parsed.data.userId !== userId || parsed.data.sessionId !== sessionId) throw AppError.forbidden("GitHub connection state is invalid or expired");
    // Compare-and-delete avoids two requests exchanging the same code.
    if (await redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", 1, stateKey(state), raw!) !== 1) throw AppError.forbidden("GitHub connection state already used");
    const saved = parsed.data, db = getPrisma();
    const row = await db.githubConnection.findUnique({ where: { userId } });
    if (!row || row.revision !== saved.revision) throw AppError.conflict("GitHub connection changed; start again");
    const tokens = await exchange({ code, redirect_uri: env.GITHUB_CALLBACK_URL, code_verifier: saved.verifier });
    const identity = z.object({ id: z.number().int().positive(), login: z.string().regex(/^[A-Za-z0-9-]{1,100}$/) }).safeParse(await githubJson("https://api.github.com/user", { headers: apiHeaders(tokens.access_token) }, 65536));
    if (!identity.success) throw AppError.serviceUnavailable("GitHub identity could not be confirmed");
    const updated = await db.$transaction(async tx => {
      const account = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true, accountStatus: true } });
      const active = await tx.refreshToken.findFirst({ where: { userId, familyId: sessionId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
      if (!active || !account?.isActive || account.accountStatus !== "ACTIVE") return 0;
      return (await tx.githubConnection.updateMany({ where: { userId, revision: saved.revision }, data: { ...credentials(tokens, userId), githubUserId: String(identity.data.id), login: identity.data.login, revision: { increment: 1 } } })).count;
    });
    if (!updated) throw AppError.conflict("Session or GitHub connection changed; start again");
    return { returnTo: saved.returnTo };
  },
  async createRepository(input: string, data: z.infer<typeof githubCreateRepoSchema>) {
    const userId = await actor(input);
    if (data.projectId) {
      const project = await getPrisma().project.findUnique({
        where: { id: data.projectId },
        select: { id: true, ownerId: true, visibility: true, exportPolicy: true },
      });
      if (!project) throw AppError.notFound("Project not found");
      const membership = await getPrisma().projectMember.findFirst({
        where: { projectId: data.projectId, userId, status: "ACTIVE" },
      });
      if (project.ownerId !== userId && !membership) throw AppError.forbidden("Project membership required");
      assertCanExportProjectSource(project, userId);
      if (project.visibility === "PRIVATE" && data.isPrivate === false) {
        throw AppError.forbidden("Cannot export private project manuscript to a public repository");
      }
    }
    const result = await provider(userId, "/user/repos", "POST", {
      name: data.name,
      description: data.description ?? "LumiGap manuscript repository",
      private: data.isPrivate ?? true,
      auto_init: true,
    });
    const parsed = z.object({
      full_name: z.string(),
      default_branch: z.string().default("main"),
      private: z.boolean(),
    }).safeParse(result);
    if (!parsed.success) throw AppError.serviceUnavailable("GitHub repository creation failed");
    return {
      fullName: parsed.data.full_name,
      defaultBranch: parsed.data.default_branch,
      private: parsed.data.private,
      writable: true,
    };
  },
  async repositories(input: string, page: number): Promise<GithubRepositories> {
    const userId = await actor(input);
    const value = z.array(z.object({ full_name: z.string(), default_branch: z.string(), private: z.boolean(), permissions: z.object({ push: z.boolean().optional() }).optional() })).safeParse(await provider(userId, `/user/repos?per_page=100&page=${page}&sort=updated`));
    if (!value.success) throw AppError.serviceUnavailable("GitHub repository list is invalid");
    return { repositories: value.data.map(row => ({ fullName: row.full_name, defaultBranch: row.default_branch, private: row.private, writable: row.permissions?.push === true })), page, hasMore: value.data.length === 100 };
  },
  async request(input: string, request: GithubRequest) {
    const validated = githubRequestSchema.parse(request), userId = await actor(input);
    const isMutation = validated.method === "POST" || validated.method === "PATCH";
    if (isMutation && !validated.projectId) {
      throw AppError.badRequest("Project identifier is required for source export or modification operations");
    }
    if (validated.projectId) {
      const project = await getPrisma().project.findUnique({
        where: { id: validated.projectId },
        select: { id: true, ownerId: true, visibility: true, exportPolicy: true },
      });
      if (!project) throw AppError.notFound("Project not found");
      const membership = await getPrisma().projectMember.findFirst({
        where: { projectId: validated.projectId, userId, status: "ACTIVE" },
      });
      if (project.ownerId !== userId && !membership) throw AppError.forbidden("Project membership required");
      if (isMutation) {
        assertCanExportProjectSource(project, userId);
        if (project.visibility === "PRIVATE") {
          const isPrivate = await checkRepoPrivacy(userId, validated.repository);
          if (!isPrivate) {
            throw AppError.forbidden("Cannot export private project manuscript to a public repository");
          }
        }
      }
    }
    const result = await provider(userId, `/repos/${validated.repository}${validated.path}`, validated.method, validated.body);
    if (validated.projectId && ((validated.method === "POST" && validated.path === "/git/refs") || (validated.method === "PATCH" && validated.path.startsWith("/git/refs/heads/")))) {
      const targetRef = (validated.body as Record<string, unknown> | undefined)?.ref;
      const refName = typeof targetRef === "string" ? targetRef : validated.path;
      const targetSha = (validated.body as Record<string, unknown> | undefined)?.sha;
      const shaStr = typeof targetSha === "string" ? targetSha : null;
      await researchLedgerService.record({
        projectId: validated.projectId,
        actorId: userId,
        eventType: "MANUSCRIPT_SOURCE_EXPORTED",
        resourceKind: "GITHUB_REPOSITORY",
        resourceId: validated.repository,
        visibility: "PROJECT_TEAM",
        retentionClass: "SECURITY_AUDIT",
        metadata: {
          repository: validated.repository,
          path: validated.path,
          method: validated.method,
          targetRef: refName,
          sha: shaStr,
        },
      }).catch((err: unknown) => {
        logger.warn({ err, repository: validated.repository }, "Failed to record GitHub export event");
      });
    }
    return result;
  },
  async disconnect(input: string) {
    const userId = await actor(input), db = getPrisma();
    // Retain the revision tombstone so pending callbacks cannot resurrect a connection.
    const previous = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT user_id FROM github_connections WHERE user_id = ${userId}::uuid FOR UPDATE`;
      const row = await tx.githubConnection.findUnique({ where: { userId } });
      await tx.githubConnection.upsert({ where: { userId }, create: { userId, revision: 1 }, update: { ...cleared, revision: { increment: 1 } } }); return row;
    });
    let revoked = !previous?.encryptedAccessToken;
    if (previous?.encryptedAccessToken && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) try {
      await githubJson(`https://api.github.com/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/token`, { method: "DELETE", headers: { Authorization: `Basic ${Buffer.from(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/json" }, body: JSON.stringify({ access_token: openGithubToken(previous.encryptedAccessToken, userId) }) }, 65536); revoked = true;
    } catch (error) { revoked = error instanceof GithubHttpError && error.status === 404; }
    return { disconnected: true, revoked };
  },
};
