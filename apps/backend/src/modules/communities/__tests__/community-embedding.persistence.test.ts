import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PAPER_EMBEDDING_DIMENSIONS, vectorParameter } from "../../../infrastructure/database/postgres-paper-search.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { getEmbeddingProvider } from "../../embeddings/embedding.factory.js";
import { nearestCommunityIds, runCommunityEmbedding } from "../community-embedding.service.js";
import { communityService } from "../community.service.js";

vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: vi.fn() }));
// Never enqueue real jobs from tests: a running dev worker would call Gemini.
vi.mock("../../../infrastructure/queue.js", () => ({ embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

const unit = (axis: number) => Array.from({ length: PAPER_EMBEDDING_DIMENSIONS }, (_, i) => (i === axis ? 1 : 0));
const near = unit(0);
const orthogonal = unit(1);
// Dedicated axis for the filter-before-LIMIT cases so real data cannot interfere.
const crowd = unit(5);
const nearCrowd = crowd.map((value, i) => (i === 6 ? 0.3 : value));

function mockProvider(embed: () => Promise<number[]>) {
  vi.mocked(getEmbeddingProvider).mockReturnValue({
    modelName: "test-model",
    modelVersion: "v1",
    dimensions: PAPER_EMBEDDING_DIMENSIONS,
    embed,
    embedBatch: async (texts: string[]) => texts.map(() => near),
  } as unknown as ReturnType<typeof getEmbeddingProvider>);
}

describe.sequential("community embedding suggestions (PostgreSQL)", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const communityIds: string[] = [];
  let ownerId = "";
  let memberId = "";
  let outsiderId = "";
  const c = { near: "", far: "", pending: "", priv: "", joined: "", fresh: "", pendingFresh: "", privA: "", privB: "", privC: "", pubA: "", pubB: "", catNear: "", catCrowd: "", catFresh: "" };

  const setEmbedding = (id: string, vector: number[]) =>
    getPrisma().$executeRaw`UPDATE communities SET embedding = CAST(${vectorParameter(vector)} AS vector) WHERE id = ${id}::uuid`;
  const embeddingIsNull = async (id: string) =>
    (await getPrisma().$queryRaw<Array<{ isNull: boolean }>>`SELECT embedding IS NULL AS "isNull" FROM communities WHERE id = ${id}::uuid`)[0]!.isNull;
  const ours = <T extends { name: string }>(rows: T[]) => rows.filter((row) => row.name.endsWith(marker)).map((row) => row.name.replace(` ${marker}`, ""));

  beforeAll(async () => {
    const prisma = getPrisma();
    const make = (key: string, data: Record<string, unknown> = {}) =>
      prisma.user.create({ data: { email: `cemb-${key}-${marker}@example.test`, fullName: `Cemb ${key}`, ...data } });
    const [owner, member, outsider] = await Promise.all([
      make("owner"),
      make("member"),
      make("outsider", { researchInterests: [`zzqx-${marker}`] }),
    ]);
    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
    const create = async (key: keyof typeof c, data: Record<string, unknown>) => {
      const community = await prisma.community.create({
        data: { name: `Cemb ${key} ${marker}`, slug: `cemb-${key}-${marker}`, ownerId, ...data } as never,
      });
      communityIds.push(community.id);
      c[key] = community.id;
    };
    await create("near", { status: "ACTIVE" });
    await create("far", { status: "ACTIVE" });
    await create("pending", { status: "PENDING_APPROVAL" });
    await create("priv", { status: "ACTIVE" });
    await create("joined", { status: "ACTIVE" });
    await create("fresh", { status: "ACTIVE" });
    await create("pendingFresh", { status: "PENDING_APPROVAL" });
    await prisma.communityMembership.create({ data: { communityId: c.joined, userId: outsiderId, role: "member", status: "active" } });
    await prisma.communityMembership.create({ data: { communityId: c.priv, userId: memberId, role: "member", status: "active" } });
    await Promise.all([c.near, c.pending, c.priv, c.joined].map((id) => setEmbedding(id, near)));
    await setEmbedding(c.far, orthogonal);

    // Three communities sit exactly on the query vector; two more are slightly farther but still above
    // the threshold. Filtering AFTER the LIMIT would let forum categories crowd them out.
    await create("privA", { status: "ACTIVE" });
    await create("privB", { status: "ACTIVE" });
    await create("privC", { status: "ACTIVE" });
    await create("pubA", { status: "ACTIVE" });
    await create("pubB", { status: "ACTIVE" });
    await Promise.all([c.privA, c.privB, c.privC].map((id) => setEmbedding(id, crowd)));
    await Promise.all([c.pubA, c.pubB].map((id) => setEmbedding(id, nearCrowd)));
    await prisma.communityMembership.create({ data: { communityId: c.privA, userId: memberId, role: "member", status: "active" } });

    // Forum categories are ACTIVE + public rows of the same table but are not joinable communities.
    // They sit exactly on the query vectors, so they would win the LIMIT if they were not excluded.
    await create("catNear", { status: "ACTIVE", isForumCategory: true, researchTopics: [`zzqx-${marker}`] });
    await create("catCrowd", { status: "ACTIVE", isForumCategory: true });
    await create("catFresh", { status: "ACTIVE", isForumCategory: true });
    await setEmbedding(c.catNear, near);
    await setEmbedding(c.catCrowd, crowd);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    const userIds = [ownerId, memberId, outsiderId].filter(Boolean);
    await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("suggest() returns near communities and drops those below the similarity threshold", async () => {
    mockProvider(async () => near);
    const result = await communityService.suggest("anything", outsiderId, "user", 10);
    const names = ours(result);
    expect(names).toContain("Cemb near");
    expect(names).not.toContain("Cemb far");
    expect(result.find((row) => row.name === `Cemb near ${marker}`)?.similarity).toBe(1);
  });

  it("suggest() hides pending communities and shows ACTIVE ones in full to everyone", async () => {
    mockProvider(async () => near);
    for (const viewer of [outsiderId, memberId]) {
      const result = await communityService.suggest("anything", viewer, "user", 10);
      expect(ours(result)).not.toContain("Cemb pending");
      const priv = result.find((row) => row.name === `Cemb priv ${marker}`);
      expect(priv).toBeDefined();
      expect(JSON.stringify(priv)).not.toMatch(/restricted|visibility/i);
    }
  });

  it("suggest() applies its filters before LIMIT so categories never crowd out real communities", async () => {
    mockProvider(async () => crowd);
    const result = await communityService.suggest("anything", outsiderId, "user", 2);
    expect(result).toHaveLength(2);
    expect(ours(result)).not.toContain("Cemb catCrowd");
    expect(ours(result).every((name) => /^Cemb (priv|pub)[ABC]$/.test(name))).toBe(true);
  });

  it("suggest() returns the same ACTIVE communities to members, outsiders and admins", async () => {
    mockProvider(async () => crowd);
    const expected = ["Cemb privA", "Cemb privB", "Cemb privC", "Cemb pubA", "Cemb pubB"];
    expect(ours(await communityService.suggest("anything", memberId, "user", 10))).toEqual(expect.arrayContaining(expected));
    expect(ours(await communityService.suggest("anything", outsiderId, "user", 10))).toEqual(expect.arrayContaining(expected));
    expect(ours(await communityService.suggest("anything", ownerId, "admin", 10))).toEqual(expect.arrayContaining(expected));
  });

  it("suggest() never returns forum categories", async () => {
    mockProvider(async () => crowd);
    const result = await communityService.suggest("anything", outsiderId, "user", 10);
    expect(ours(result)).not.toContain("Cemb catCrowd");
    mockProvider(async () => near);
    expect(ours(await communityService.suggest("anything", ownerId, "admin", 10))).not.toContain("Cemb catNear");
  });

  it("recommend() never returns forum categories, by text match or by semantic match", async () => {
    mockProvider(async () => near);
    const names = ours(await communityService.recommend(outsiderId, 10));
    expect(names).toContain("Cemb near");
    expect(names).not.toContain("Cemb catNear");
    expect(names).not.toContain("Cemb catCrowd");
  });

  it("runCommunityEmbedding() does not embed forum categories", async () => {
    mockProvider(async () => near);
    const result = await runCommunityEmbedding({ ids: [c.catFresh] });
    expect(result.totalEmbedded).toBe(0);
    expect(await embeddingIsNull(c.catFresh)).toBe(true);
  });

  it("suggest() returns [] instead of throwing when embedding fails", async () => {
    mockProvider(async () => { throw new Error("quota exceeded"); });
    await expect(communityService.suggest("anything", outsiderId, "user")).resolves.toEqual([]);
  });

  it("recommend() falls back to semantic matches and skips joined ones", async () => {
    mockProvider(async () => near);
    const result = await communityService.recommend(outsiderId, 10);
    const names = ours(result);
    expect(names).toContain("Cemb near");
    expect(names).not.toContain("Cemb joined");
    expect(names).toContain("Cemb priv");
    expect(result.find((row) => row.name === `Cemb priv ${marker}`)).toMatchObject({ matchReason: "semantic" });
    expect(result.filter((row) => row.name.endsWith(marker)).every((row) => row.matchReason === "semantic")).toBe(true);
  });

  it("recommend() matches every ACTIVE community by its topics", async () => {
    const prisma = getPrisma();
    const topic = `zzqx-${marker}`;
    const [first, second] = await Promise.all([
      prisma.community.create({ data: { name: `Cemb topicOne ${marker}`, slug: `cemb-topicone-${marker}`, ownerId, status: "ACTIVE", researchTopics: [topic] } }),
      prisma.community.create({ data: { name: `Cemb topicTwo ${marker}`, slug: `cemb-topictwo-${marker}`, ownerId, status: "ACTIVE", researchTopics: [topic] } }),
    ]);
    communityIds.push(first.id, second.id);
    mockProvider(async () => { throw new Error("no embedding needed"); });
    const result = await communityService.recommend(outsiderId, 10);
    const byName = new Map(result.map((row) => [row.name, row]));
    expect(byName.get(`Cemb topicOne ${marker}`)?.matchReason).toBe("topic");
    expect(byName.get(`Cemb topicTwo ${marker}`)?.matchReason).toBe("topic");
  });

  it("recommend() still resolves with string matches only when embedding fails", async () => {
    mockProvider(async () => { throw new Error("quota exceeded"); });
    await expect(communityService.recommend(outsiderId, 6)).resolves.toBeInstanceOf(Array);
  });

  it("runCommunityEmbedding() embeds ACTIVE communities only and records provenance", async () => {
    mockProvider(async () => near);
    const result = await runCommunityEmbedding({ ids: [c.fresh, c.pendingFresh] });
    expect(result.totalEmbedded).toBe(1);
    expect(await embeddingIsNull(c.fresh)).toBe(false);
    expect(await embeddingIsNull(c.pendingFresh)).toBe(true);
    const row = await getPrisma().community.findUniqueOrThrow({
      where: { id: c.fresh },
      select: { embeddingModel: true, embeddingVersion: true, embeddingDimensions: true, embeddingUpdatedAt: true },
    });
    expect(row).toMatchObject({ embeddingModel: "test-model", embeddingVersion: "v1", embeddingDimensions: PAPER_EMBEDDING_DIMENSIONS });
    expect(row.embeddingUpdatedAt).toBeInstanceOf(Date);
  });

  it("runCommunityEmbedding() does not re-embed a community edited mid-run within the same run", async () => {
    const prisma = getPrisma();
    const [edited, other] = await Promise.all(["churnA", "churnB"].map(async (key) => {
      const community = await prisma.community.create({ data: { name: `Cemb ${key} ${marker}`, slug: `cemb-${key}-${marker}`, ownerId, status: "ACTIVE" } });
      communityIds.push(community.id);
      return community;
    }));
    const embedBatch = vi.fn(async (texts: string[]) => {
      // Someone edits `edited` after it was read: the UPDATE guard skips it, leaving it stale.
      if (embedBatch.mock.calls.length === 1) await prisma.$executeRaw`UPDATE communities SET updated_at = now() + interval '1 second' WHERE id = ${edited.id}::uuid`;
      return texts.map(() => near);
    });
    vi.mocked(getEmbeddingProvider).mockReturnValue({
      modelName: "test-model", modelVersion: "v1", dimensions: PAPER_EMBEDDING_DIMENSIONS, embed: async () => near, embedBatch,
    } as unknown as ReturnType<typeof getEmbeddingProvider>);
    const result = await runCommunityEmbedding({ ids: [edited.id, other.id] });
    expect(result.totalEmbedded).toBe(1);
    expect(embedBatch).toHaveBeenCalledTimes(1);
    expect(await embeddingIsNull(other.id)).toBe(false);
    expect(await embeddingIsNull(edited.id)).toBe(true);
  });

  it("nearestCommunityIds() excludes archived communities and categories", async () => {
    const archived = await getPrisma().community.create({ data: { name: `Cemb archived ${marker}`, slug: `cemb-archived-${marker}`, ownerId, status: "ARCHIVED" } });
    communityIds.push(archived.id);
    await setEmbedding(archived.id, near);
    const ids = (await nearestCommunityIds(near, { limit: 100, minSimilarity: 0.99 })).map((row) => row.id);
    expect(ids).toContain(c.near);
    expect(ids).toContain(c.priv);
    expect(ids).not.toContain(archived.id);
    expect(ids).not.toContain(c.catNear);
    expect(ids).not.toContain(c.pending);
  });

  it("update() clears the embedding when embedded content changes, but not for other fields", async () => {
    expect(await embeddingIsNull(c.near)).toBe(false);
    await communityService.update(c.near, { rules: ["Be kind"] }, ownerId, "admin");
    expect(await embeddingIsNull(c.near)).toBe(false);
    await communityService.update(c.near, { description: `Rewritten ${marker}` }, ownerId, "admin");
    expect(await embeddingIsNull(c.near)).toBe(true);
  });
});
