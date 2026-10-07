import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PAPER_EMBEDDING_DIMENSIONS, vectorParameter } from "../../../infrastructure/database/postgres-paper-search.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { getEmbeddingProvider } from "../../embeddings/embedding.factory.js";
import { runCommunityEmbedding } from "../community-embedding.service.js";
import { communityService } from "../community.service.js";

vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: vi.fn() }));
// Never enqueue real jobs from tests: a running dev worker would call Gemini.
vi.mock("../../../infrastructure/queue.js", () => ({ embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

const unit = (axis: number) => Array.from({ length: PAPER_EMBEDDING_DIMENSIONS }, (_, i) => (i === axis ? 1 : 0));
const near = unit(0);
const orthogonal = unit(1);
// Dedicated axis for the visibility-before-LIMIT cases so real data cannot interfere.
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
    await create("priv", { status: "ACTIVE", visibility: "private" });
    await create("joined", { status: "ACTIVE" });
    await create("fresh", { status: "ACTIVE" });
    await create("pendingFresh", { status: "PENDING_APPROVAL" });
    await prisma.communityMembership.create({ data: { communityId: c.joined, userId: outsiderId, role: "member", status: "active" } });
    await prisma.communityMembership.create({ data: { communityId: c.priv, userId: memberId, role: "member", status: "active" } });
    await Promise.all([c.near, c.pending, c.priv, c.joined].map((id) => setEmbedding(id, near)));
    await setEmbedding(c.far, orthogonal);

    // Three private communities sit exactly on the query vector; two public ones are slightly
    // farther but still above the threshold. Filtering visibility AFTER the LIMIT would return none.
    await create("privA", { status: "ACTIVE", visibility: "private" });
    await create("privB", { status: "ACTIVE", visibility: "private" });
    await create("privC", { status: "ACTIVE", visibility: "private" });
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

  it("suggest() hides pending communities and hides private ones from non-members", async () => {
    mockProvider(async () => near);
    const asOutsider = ours(await communityService.suggest("anything", outsiderId, "user", 10));
    expect(asOutsider).not.toContain("Cemb pending");
    expect(asOutsider).not.toContain("Cemb priv");
    const asMember = ours(await communityService.suggest("anything", memberId, "user", 10));
    expect(asMember).toContain("Cemb priv");
    expect(asMember).not.toContain("Cemb pending");
  });

  it("suggest() applies visibility before LIMIT so hidden communities never crowd out visible ones", async () => {
    mockProvider(async () => crowd);
    const result = await communityService.suggest("anything", outsiderId, "user", 2);
    expect(result).toHaveLength(2);
    expect(ours(result).sort()).toEqual(["Cemb pubA", "Cemb pubB"]);
  });

  it("suggest() includes a private community the viewer belongs to, and everything for admins", async () => {
    mockProvider(async () => crowd);
    const asMember = ours(await communityService.suggest("anything", memberId, "user", 10));
    expect(asMember).toContain("Cemb privA");
    expect(asMember).not.toContain("Cemb privB");
    const asAdmin = ours(await communityService.suggest("anything", ownerId, "admin", 10));
    expect(asAdmin).toEqual(expect.arrayContaining(["Cemb privA", "Cemb privB", "Cemb privC", "Cemb pubA", "Cemb pubB"]));
  });

  it("suggest() never returns forum categories and still fills the limit with real communities", async () => {
    mockProvider(async () => crowd);
    const result = await communityService.suggest("anything", outsiderId, "user", 2);
    expect(ours(result)).not.toContain("Cemb catCrowd");
    expect(ours(result).sort()).toEqual(["Cemb pubA", "Cemb pubB"]);
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

  it("recommend() falls back to semantic matches and skips joined and private communities", async () => {
    mockProvider(async () => near);
    const result = await communityService.recommend(outsiderId, 10);
    const names = ours(result);
    expect(names).toContain("Cemb near");
    expect(names).not.toContain("Cemb joined");
    expect(names).not.toContain("Cemb priv");
    expect(result.filter((row) => row.name.endsWith(marker)).every((row) => row.matchReason === "semantic")).toBe(true);
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

  it("update() clears the embedding when embedded content changes, but not for other fields", async () => {
    expect(await embeddingIsNull(c.near)).toBe(false);
    await communityService.update(c.near, { rules: ["Be kind"] }, ownerId, "admin");
    expect(await embeddingIsNull(c.near)).toBe(false);
    await communityService.update(c.near, { description: `Rewritten ${marker}` }, ownerId, "admin");
    expect(await embeddingIsNull(c.near)).toBe(true);
  });
});
