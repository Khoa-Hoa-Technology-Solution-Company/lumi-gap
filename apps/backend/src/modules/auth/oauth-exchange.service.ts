import crypto from "node:crypto";
import type { AuthResponse } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { redis } from "../../infrastructure/redis.js";

const OAUTH_EXCHANGE_TTL_SECONDS = 60;
const KEY_PREFIX = "oauth:exchange:";

function exchangeKey(code: string): string {
  const digest = crypto.createHash("sha256").update(code).digest("hex");
  return `${KEY_PREFIX}${digest}`;
}

export const oauthExchangeService = {
  async create(result: AuthResponse): Promise<string> {
    const code = crypto.randomBytes(32).toString("base64url");
    const stored = await redis.set(
      exchangeKey(code),
      JSON.stringify(result),
      "EX",
      OAUTH_EXCHANGE_TTL_SECONDS,
      "NX",
    );
    if (stored !== "OK") throw AppError.serviceUnavailable("Unable to complete Google sign-in");
    return code;
  },

  async consume(code: string): Promise<AuthResponse> {
    const raw = await redis.getdel(exchangeKey(code));
    if (!raw) throw AppError.unauthorized("OAuth exchange code is invalid or expired");

    try {
      return JSON.parse(raw) as AuthResponse;
    } catch {
      throw AppError.unauthorized("OAuth exchange code is invalid or expired");
    }
  },
};
