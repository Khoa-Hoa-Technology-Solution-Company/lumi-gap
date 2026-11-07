/**
 * Merges keywords that only differ by spacing, hyphens or a plural last word ("large language model" into
 * "large language models"). Each group keeps its active keyword with the most papers; the others are merged into it
 * through the same path as the admin "Merge" action, so papers, tag rules and aliases move with them.
 * Hidden keywords are left alone. Dry run by default.
 *
 * Run: pnpm --filter backend keywords:dedupe            (prints the groups)
 *      pnpm --filter backend keywords:dedupe --apply    (merges them)
 */
import "../src/config/env.js";
import { disconnectRedis } from "../src/infrastructure/redis.js";
import { connectPostgres, disconnectPostgres, getPrisma } from "../src/infrastructure/database/prisma.js";
import { taxonomyService } from "../src/modules/taxonomy/taxonomy.service.js";
import { isAcronym, keywordMatchKey } from "../src/modules/taxonomy/taxonomy.normalize.js";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  await connectPostgres();
  const keywords = await getPrisma().keyword.findMany({
    where: { status: "active" },
    select: { id: true, keywordName: true, normalizedName: true, paperCount: true },
    orderBy: [{ paperCount: "desc" }, { normalizedName: "asc" }],
  });
  const groups = new Map<string, typeof keywords>();
  for (const keyword of keywords) {
    if (isAcronym(keyword.keywordName)) continue;
    const key = keywordMatchKey(keyword.normalizedName);
    if (key) groups.set(key, [...(groups.get(key) ?? []), keyword]);
  }

  let merged = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const [target, ...sources] = group;
    console.log(`${target!.keywordName} (${target!.paperCount}) <- ${sources.map((s) => `${s.keywordName} (${s.paperCount})`).join(", ")}`);
    if (!apply) continue;
    for (const source of sources) {
      await taxonomyService.mergeKeywords(source.id, target!.id);
      merged += 1;
    }
  }
  console.log(apply ? `merged ${merged} keyword(s)` : "dry run; pass --apply to merge");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await disconnectPostgres().catch(() => undefined);
    await disconnectRedis().catch(() => undefined);
  });
