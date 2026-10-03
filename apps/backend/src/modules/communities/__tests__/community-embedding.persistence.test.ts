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
  const c = { near: "", far: "", pending: "", priv: "", joined: "", fresh: "", pendingFresh: "" };

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
