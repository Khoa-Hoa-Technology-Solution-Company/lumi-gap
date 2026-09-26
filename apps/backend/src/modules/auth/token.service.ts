import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import type { SystemRole } from "@trend/shared-types";

export interface AccessTokenClaims {
  sub: string;
  systemRole: SystemRole;
  sessionId: string;
}

let testKeys: ReturnType<typeof crypto.generateKeyPairSync> | undefined;

function accessKeys(): { privateKey: crypto.KeyObject | string; publicKey: crypto.KeyObject | string } {
  if (process.env.VITEST === "true") {
    testKeys ??= crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    return testKeys;
  }
  try {
    return {
      privateKey: readFileSync(resolve(process.cwd(), env.JWT_PRIVATE_KEY_PATH), "utf8"),
      publicKey: readFileSync(resolve(process.cwd(), env.JWT_PUBLIC_KEY_PATH), "utf8"),
    };
  } catch {
    throw new Error(
      `RS256 key files are missing. Generate ${env.JWT_PRIVATE_KEY_PATH} and ${env.JWT_PUBLIC_KEY_PATH} before starting the backend.`,
    );
  }
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function createOpaqueToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export const tokenService = {
  signAccessToken(claims: AccessTokenClaims): { token: string; expiresAt: Date } {
    const { privateKey } = accessKeys();
    const token = jwt.sign(claims, privateKey, {
      algorithm: "RS256",
      expiresIn: env.JWT_ACCESS_TTL,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    } as SignOptions);
    const decoded = jwt.decode(token) as { exp?: number } | null;
    if (!decoded?.exp) throw new Error("Access token expiration was not generated");
    return { token, expiresAt: new Date(decoded.exp * 1000) };
  },

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const { publicKey } = accessKeys();
      const claims = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      }) as jwt.JwtPayload;
      if (
        typeof claims.sub !== "string"
        || !["RESEARCH_USER", "ADMIN", "SUPER_ADMIN"].includes(claims.systemRole as string)
        || typeof claims.sessionId !== "string"
      ) throw new Error("Malformed access token claims");
      return claims as unknown as AccessTokenClaims;
    } catch {
      throw AppError.unauthorized("Invalid or expired access token");
    }
  },

  signPurposeToken(payload: Record<string, string>, purpose: string, expiresIn: SignOptions["expiresIn"]): string {
    const { privateKey } = accessKeys();
    return jwt.sign({ ...payload, purpose }, privateKey, {
      algorithm: "RS256",
      expiresIn,
      issuer: env.JWT_ISSUER,
      audience: `${env.JWT_AUDIENCE}:${purpose}`,
    });
  },

  verifyPurposeToken(token: string, purpose: string): jwt.JwtPayload {
    try {
      const { publicKey } = accessKeys();
      const payload = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        issuer: env.JWT_ISSUER,
        audience: `${env.JWT_AUDIENCE}:${purpose}`,
      }) as jwt.JwtPayload;
      if (payload.purpose !== purpose) throw new Error("Invalid token purpose");
      return payload;
    } catch {
      throw AppError.unauthorized("Token is invalid or expired");
    }
  },
};
