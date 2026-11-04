import { cache } from "../../infrastructure/cache.js";

/**
 * Cache key of a user's interest profile. Kept in its own tiny file (imports only the cache) so community.service
 * and forum.service can invalidate it without importing personalization.service, which would be an import cycle.
 */
export const profileCacheKey = (userId: string) => `personalization:profile:v1:${userId}`;

export async function invalidatePersonalizationProfile(userId: string): Promise<void> {
  await cache.del(profileCacheKey(userId));
}
