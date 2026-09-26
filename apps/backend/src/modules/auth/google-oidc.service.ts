import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { redis } from "../../infrastructure/redis.js";
import type { GoogleIdentity } from "./auth.service.js";

const STATE_TTL_SECONDS = 10 * 60;
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function stateKey(state: string): string {
  return `oauth:google:state:${crypto.createHash("sha256").update(state).digest("hex")}`;
}

function configured(): { clientId: string; clientSecret: string } {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw AppError.serviceUnavailable("Google sign-in is not configured");
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export function resolveOAuthReturnOrigin(candidate?: string): string {
  const allowed = env.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean);
  const fallback = allowed[0] ?? "http://localhost:3000";
  if (!candidate) return fallback;
  try {
    const parsed = new URL(candidate);
    const normalized = parsed.origin;
    return allowed.some((origin) => new URL(origin).origin === normalized) ? normalized : fallback;
  } catch {
    return fallback;
  }
}

export const googleOidcService = {
  async authorizationUrl(returnOrigin?: string): Promise<string> {
    const { clientId } = configured();
    const state = crypto.randomBytes(32).toString("base64url");
    const nonce = crypto.randomBytes(32).toString("base64url");
    const codeVerifier = crypto.randomBytes(48).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    const stored = await redis.set(
      stateKey(state), JSON.stringify({ nonce, codeVerifier, returnOrigin: resolveOAuthReturnOrigin(returnOrigin) }), "EX", STATE_TTL_SECONDS, "NX",
    );
    if (stored !== "OK") throw AppError.serviceUnavailable("Unable to start Google sign-in");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", env.GOOGLE_CALLBACK_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  },

  async exchange(code: string, state: string): Promise<{ identity: GoogleIdentity; returnOrigin: string }> {
    const { clientId, clientSecret } = configured();
    const raw = await redis.getdel(stateKey(state));
    if (!raw) throw AppError.unauthorized("Google sign-in state is invalid or expired");
    let saved: { nonce: string; codeVerifier: string; returnOrigin?: string };
    try { saved = JSON.parse(raw) as typeof saved; } catch { throw AppError.unauthorized("Google sign-in state is invalid or expired"); }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: env.GOOGLE_CALLBACK_URL,
        grant_type: "authorization_code",
        code_verifier: saved.codeVerifier,
      }),
    });
    if (!response.ok) throw AppError.unauthorized("Google sign-in could not be completed");
    const tokenSet = await response.json() as { id_token?: string };
    if (!tokenSet.id_token) throw AppError.unauthorized("Google identity token is missing");

    let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"] | undefined;
    for (const issuer of GOOGLE_ISSUERS) {
      try {
        payload = (await jwtVerify(tokenSet.id_token, GOOGLE_JWKS, {
          algorithms: ["RS256"], audience: clientId, issuer,
        })).payload;
        break;
      } catch { /* Try Google's alternate canonical issuer. */ }
    }
    if (!payload || payload.nonce !== saved.nonce || typeof payload.sub !== "string"
      || typeof payload.email !== "string" || typeof payload.email_verified !== "boolean") {
      throw AppError.unauthorized("Google identity token is invalid");
    }
    return {
      returnOrigin: resolveOAuthReturnOrigin(saved.returnOrigin),
      identity: {
        subject: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
        name: typeof payload.name === "string" ? payload.name : payload.email,
        picture: typeof payload.picture === "string" ? payload.picture : undefined,
      },
    };
  },
};
