import { createHash } from "node:crypto";
import { redis } from "../../infrastructure/redis.js";
import { AppError } from "../../common/exceptions/app-error.js";

export const orcidStateDigest = (state: string) => createHash("sha256").update(state).digest("hex");
export const orcidStateKey = (state: string) => `oauth:orcid:state:${orcidStateDigest(state)}`;
export const orcidLatestKey = (userId: string) => `oauth:orcid:latest:${userId}`;
export async function orcidCache<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch { throw AppError.serviceUnavailable("ORCID connection is temporarily unavailable. Please try again."); }
}
/** Called under the same user-row lock as OAuth completion. Fail closed on Redis failure. */
export async function cancelPendingOrcid(userId: string) {
  await orcidCache(() => redis.del(orcidLatestKey(userId)));
}
