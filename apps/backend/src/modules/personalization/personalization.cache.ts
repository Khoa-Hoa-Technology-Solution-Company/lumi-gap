import { cache } from "../../infrastructure/cache.js";

/**
 * Cache of a user's interest profile. Kept in its own tiny file (imports only the cache) so community.service and
 * forum.service can invalidate it without importing personalization.service, which would be an import cycle.
 *
 * Invalidation bumps a per-user version instead of deleting the entry: a slow build that started before the bump
 * writes under the OLD version key, which is never read again, so a stale profile can never overwrite a fresh one.
 */
export const profileVersionKey = (userId: string) => `personalization:profile-version:${userId}`;
export const profileCacheKey = (userId: string, version: number) => `personalization:profile:v2:${userId}:${version}`;

/** Version to read BEFORE building from the database; null when Redis is unavailable (build without caching). */
export async function readProfileVersion(userId: string): Promise<number | null> {
  return cache.getInt(profileVersionKey(userId));
}

/** Call after the change has committed. Never throws: without Redis there is no cache to go stale. */
export async function invalidatePersonalizationProfile(userId: string): Promise<void> {
  await cache.incr(profileVersionKey(userId));
}
