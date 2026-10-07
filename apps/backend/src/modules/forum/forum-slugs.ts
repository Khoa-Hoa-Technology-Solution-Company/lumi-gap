import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";

export function forumPublicSlug(title: string): string {
  const base = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 260).replace(/-+$/g, "") || "discussion";
  // ID-shaped titles must not be mistaken for UUID/legacy read locators.
  return parseDatabaseId(base) ? `${base}-discussion` : base;
}

export async function allocateForumSlug(tx: Prisma.TransactionClient, title: string): Promise<string> {
  const base = forumPublicSlug(title);
  for (let suffix = 1; suffix <= 1000; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const reserved = await tx.forumPost.findFirst({ where: { OR: [{ publicSlug: candidate }, { publicSlugAliases: { has: candidate } }] }, select: { id: true } });
    if (!reserved) return candidate;
  }
  throw AppError.conflict("Too many discussions share this title. Choose a more specific title.");
}

export async function withSlugRetry<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  // Retry the whole transaction, not just insert: references and community counts
  // must commit exactly once on concurrent same-title submissions.
  for (let attempt = 0; ; attempt++) {
    try { return await getPrisma().$transaction(work); }
    catch (error) { if ((error as { code?: string }).code !== "P2002" || attempt >= 3) throw error; }
  }
}

/** Seed/import fixtures created after migrations need slugs too. Never rename published URLs. */
export async function backfillForumSlugs(postIds?: string[]): Promise<void> {
  for (;;) {
    const rows = await getPrisma().forumPost.findMany({ where: { publicSlug: null, ...(postIds ? { id: { in: postIds } } : {}) }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 });
    if (!rows.length) return;
    for (const row of rows) await withSlugRetry(async (tx) => {
      const post = await tx.forumPost.findUnique({ where: { id: row.id }, select: { title: true, publicSlug: true } });
      if (post && !post.publicSlug) await tx.forumPost.update({ where: { id: row.id }, data: { publicSlug: await allocateForumSlug(tx, post.title) } });
    });
  }
}
