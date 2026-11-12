import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { OrcidConnectionAvailability } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { redis } from "../../infrastructure/redis.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { mapAcademicIdentity } from "./academic-identity.service.js";
import { isValidOrcid } from "./dto/academic-profile.schema.js";
import { orcidCallbackSchema } from "./dto/orcid-oauth.schema.js";
import { orcidCache, orcidLatestKey, orcidStateDigest, orcidStateKey } from "./orcid-oauth-state.js";
import { cancelPendingOrcid } from "./orcid-oauth-state.js";
import { resolveOAuthReturnOrigin } from "../auth/google-oidc.service.js";

const stateSchema = z.object({ userId: z.string().uuid(), sessionId: z.string(), createdAt: z.number(), config: z.string(), identity: z.object({ id: z.string(), updatedAt: z.string() }).nullable() });
const invalidState = () => AppError.forbidden("ORCID connection expired. Start again with the original LumiGap account.");
const configurationDigest = () => orcidStateDigest(JSON.stringify([env.ORCID_BASE_URL, env.ORCID_CLIENT_ID, env.ORCID_REDIRECT_URI]));
function configured() {
  if (!env.ORCID_CLIENT_ID || !env.ORCID_CLIENT_SECRET) throw AppError.serviceUnavailable("ORCID connection is not configured.");
  return { clientId: env.ORCID_CLIENT_ID, clientSecret: env.ORCID_CLIENT_SECRET };
}
async function actor(input: string) {
  const parsed = parseDatabaseId(input);
  const user = parsed && await getPrisma().user.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }, select: { id: true, isActive: true, accountStatus: true } });
  if (!user?.isActive || user.accountStatus !== "ACTIVE") throw AppError.unauthorized();
  return user.id;
}
async function lockSession(tx: Prisma.TransactionClient, userId: string, sessionId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
  // Serialize publication of the link with logout/refresh-token revocation.
  await tx.$queryRaw`SELECT id FROM refresh_tokens WHERE user_id = ${userId}::uuid AND family_id = ${sessionId}::uuid AND revoked_at IS NULL AND expires_at > NOW() FOR SHARE`;
  const [user, session] = await Promise.all([
    tx.user.findUnique({ where: { id: userId }, select: { isActive: true, accountStatus: true } }),
    tx.refreshToken.findFirst({ where: { userId, familyId: sessionId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } }),
  ]);
  if (!user?.isActive || user.accountStatus !== "ACTIVE" || !session) throw AppError.unauthorized("Account or session is no longer active");
}
async function exchange(code: string): Promise<string> {
  const { clientId, clientSecret } = configured();
  try {
    const response = await fetch(`${env.ORCID_BASE_URL}/oauth/token`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: env.ORCID_REDIRECT_URI }),
    });
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(); }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 16384) throw new Error(); chunks.push(next.value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const result = z.object({ orcid: z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/).refine(isValidOrcid), token_type: z.string().refine(value => value.toLowerCase() === "bearer"), access_token: z.string().min(1).max(4096), scope: z.string().refine(value => value.split(/\s+/).includes("/authenticate")) }).safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!result.success) throw new Error();
    // Linking only needs the authenticated identifier. Never persist, return, or log tokens/names.
    return result.data.orcid;
  } catch { throw AppError.serviceUnavailable("ORCID could not confirm the connection. Please start again."); }
}

export const orcidOauthService = {
  availability(): OrcidConnectionAvailability { return { configured: Boolean(env.ORCID_CLIENT_ID && env.ORCID_CLIENT_SECRET), environment: env.ORCID_BASE_URL === "https://sandbox.orcid.org" ? "SANDBOX" : "PRODUCTION" }; },
  async start(input: string, sessionId: string) {
    const { clientId } = configured(), userId = await actor(input), state = randomBytes(32).toString("base64url");
    await getPrisma().$transaction(async tx => {
      await lockSession(tx, userId, sessionId);
      const identity = await tx.academicIdentityLink.findFirst({ where: { userId, provider: "ORCID" } });
      if (identity?.verificationStatus === "PROVIDER_CONNECTED") throw AppError.conflict("Disconnect your existing ORCID before connecting another account.");
      const value = JSON.stringify({ userId, sessionId, createdAt: Date.now(), config: configurationDigest(), identity: identity ? { id: identity.id, updatedAt: identity.updatedAt.toISOString() } : null });
      await orcidCache(() => redis.eval("redis.call('SET',KEYS[1],ARGV[1],'EX',600); redis.call('SET',KEYS[2],ARGV[2],'EX',600); return 1", 2, orcidStateKey(state), orcidLatestKey(userId), value, orcidStateDigest(state)));
    });
    const url = new URL(`${env.ORCID_BASE_URL}/oauth/authorize`);
    for (const [name, value] of Object.entries({ client_id: clientId, response_type: "code", scope: "/authenticate", redirect_uri: env.ORCID_REDIRECT_URI, state })) url.searchParams.set(name, value);
    await auditService.log("academic_profile.orcid.started", { userId, details: { environment: this.availability().environment } });
    return { authorizationUrl: url.toString(), state };
  },
  async callback(input: string, sessionId: string, raw: unknown) {
    const command = orcidCallbackSchema.parse(raw), userId = await actor(input);
    try {
      configured();
      const value = await orcidCache(() => redis.get(orcidStateKey(command.state)));
      let saved: unknown; try { saved = value ? JSON.parse(value) : null; } catch { saved = null; }
      const parsed = stateSchema.safeParse(saved);
      if (!parsed.success || parsed.data.userId !== userId || parsed.data.sessionId !== sessionId || parsed.data.createdAt > Date.now() || Date.now() - parsed.data.createdAt >= 600000 || parsed.data.config !== configurationDigest()) throw invalidState();
      if (await orcidCache(() => redis.getdel(orcidStateKey(command.state))) !== value) throw invalidState();
      if (await orcidCache(() => redis.get(orcidLatestKey(userId))) !== orcidStateDigest(command.state)) throw invalidState();
      // Revoked sessions must not initiate a provider request; recheck again before persistence.
      await getPrisma().$transaction(tx => lockSession(tx, userId, sessionId));
      if (command.error) {
        await orcidCache(() => redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, orcidLatestKey(userId), orcidStateDigest(command.state)));
        if (command.error !== "access_denied") throw AppError.serviceUnavailable("ORCID could not confirm the connection. Please start again.");
        await auditService.log("academic_profile.orcid.cancelled", { userId });
        return { cancelled: true as const };
      }
      const identifier = await exchange(command.code!);
      const identity = await getPrisma().$transaction(async tx => {
        await lockSession(tx, userId, sessionId);
        if (await orcidCache(() => redis.get(orcidLatestKey(userId))) !== orcidStateDigest(command.state)) throw invalidState();
        const current = await tx.academicIdentityLink.findFirst({ where: { userId, provider: "ORCID" } });
        if ((current?.id ?? null) !== (parsed.data.identity?.id ?? null) || current && current.updatedAt.toISOString() !== parsed.data.identity?.updatedAt) throw AppError.conflict("Your academic identity changed. Please connect ORCID again.");
        if (current?.verificationStatus === "PROVIDER_CONNECTED") throw AppError.conflict("ORCID is already connected.");
        const duplicate = await tx.academicIdentityLink.findFirst({ where: { provider: "ORCID", identifier, verificationStatus: "PROVIDER_CONNECTED", userId: { not: userId } } });
        if (duplicate) throw AppError.conflict("This ORCID iD is already connected to another LumiGap account.");
        const data = { identifier, profileUrl: `${env.ORCID_BASE_URL}/${identifier}`, connectionMethod: "OAUTH", status: "CONNECTED", verificationStatus: "PROVIDER_CONNECTED" };
        const row = current ? await tx.academicIdentityLink.update({ where: { id: current.id, userId, updatedAt: current.updatedAt }, data }) : await tx.academicIdentityLink.create({ data: { ...data, userId, provider: "ORCID", visibility: "PRIVATE" } });
        // Disconnect/start use this same user lock; an in-flight response cannot resurrect an unlink.
        await orcidCache(() => redis.del(orcidLatestKey(userId)));
        return row;
      });
      await auditService.log("academic_profile.orcid.connected", { userId, targetTableName: "academic_identity_links", targetRecordId: identity.id, details: { environment: this.availability().environment } });
      return { cancelled: false as const, identity: mapAcademicIdentity(identity as Parameters<typeof mapAcademicIdentity>[0]) };
    } catch (error) {
      await auditService.log("academic_profile.orcid.failed", { userId });
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw AppError.conflict("This ORCID iD is already connected or your academic identity changed. Please start again.");
      if (error && typeof error === "object" && "code" in error && error.code === "P2025") throw AppError.conflict("Your academic identity changed. Please connect ORCID again.");
      throw error;
    }
  },
};

/** Compatibility contract for main's API; linking still uses one authenticated flow. */
export function resolveOrcidBaseUrl(rawBaseUrl: string = env.ORCID_BASE_URL) {
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");
  if (baseUrl !== "https://orcid.org" && baseUrl !== "https://sandbox.orcid.org") throw AppError.serviceUnavailable("ORCID base URL is invalid or not allowed");
  return { baseUrl, environment: baseUrl === "https://orcid.org" ? "production" as const : "sandbox" as const };
}
export function isValidOrcidRedirectUri(value?: string) {
  if (!value) return false;
  try { const url = new URL(value); return !url.username && !url.password && !url.search && !url.hash && (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)); } catch { return false; }
}
export function getOrcidConfig() {
  return { ...resolveOrcidBaseUrl(), configured: Boolean(env.ORCID_CLIENT_ID && env.ORCID_CLIENT_SECRET && isValidOrcidRedirectUri(env.ORCID_REDIRECT_URI)) };
}
export const orcidOAuthService = {
  async status(input: string) {
    const userId = await actor(input);
    const identity = await getPrisma().academicIdentityLink.findFirst({ where: { userId, provider: "ORCID" } });
    return { ...getOrcidConfig(), connected: identity?.verificationStatus === "PROVIDER_CONNECTED", link: identity ? mapAcademicIdentity(identity as Parameters<typeof mapAcademicIdentity>[0]) : null };
  },
  async start(input: string, sessionId?: string, _options?: { returnTo?: string; returnOrigin?: string }) {
    if (!sessionId) throw AppError.unauthorized("An active session is required to connect ORCID");
    const result = await orcidOauthService.start(input, sessionId);
    return { ...result, url: result.authorizationUrl };
  },
  async complete(input: { authenticatedUserId?: string; authenticatedSessionId?: string; code?: string; state?: string; error?: string; errorDescription?: string }) {
    configured();
    if (!input.authenticatedUserId || !input.authenticatedSessionId) throw AppError.unauthorized("Complete ORCID linking from the original authenticated session");
    const result = await orcidOauthService.callback(input.authenticatedUserId, input.authenticatedSessionId, { state: input.state, ...(input.error ? { error: input.error } : { code: input.code }) });
    if (result.cancelled) throw AppError.badRequest("ORCID authorization was cancelled");
    return { link: result.identity, returnTo: "/profile", returnOrigin: resolveOAuthReturnOrigin() };
  },
  async disconnect(input: string) {
    const userId = await actor(input);
    const removed = await getPrisma().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR NO KEY UPDATE`;
      await cancelPendingOrcid(userId);
      const identity = await tx.academicIdentityLink.findFirst({ where: { userId, provider: "ORCID" } });
      if (identity) await tx.academicIdentityLink.delete({ where: { id: identity.id, userId, updatedAt: identity.updatedAt } });
      return identity;
    });
    await auditService.log("academic_profile.orcid.disconnected", { userId, targetTableName: "academic_identity_links", targetRecordId: removed?.id });
    return { disconnected: true as const };
  },
};
