import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";

/** Additive fixtures only: existing topics, credentials and memberships are untouched. */
export async function seedForumPagination() {
  if (process.env.NODE_ENV === "production") throw new Error("Development fixtures cannot run in production");
  const prisma = getPrisma();
  const [author, community] = await Promise.all([
    prisma.user.findUnique({ where: { email: "minh.anh.nguyen@lumigap.demo" }, select: { id: true } }),
    prisma.community.findUnique({ where: { slug: "software-engineering" }, select: { id: true } }),
  ]);
  if (!author || !community) throw new Error("Current development forum seed must exist first");
  const fixtures = [
    ["How should missing outcomes be documented in a review protocol?", "QUESTION", "We are documenting the review protocol before screening. Which missing outcomes should be recorded, and how can we distinguish unavailable data from outcomes that were not measured?"],
    ["Separating task completion from code quality in developer studies", "DISCUSSION", "A shorter completion time does not necessarily mean a higher-quality change. How are others measuring maintainability, defect introduction, and reviewer effort alongside task completion?"],
    ["What belongs in a transparent literature-search log?", "QUESTION", "Search sources change over time. I would like to record query strings, search dates, exclusions, and exported identifiers in a way that supports a later replication."],
    ["Reporting disagreement without hiding reconciliation decisions", "DISCUSSION", "A single final agreement score can obscure important coding decisions. Could a disagreement log and a sensitivity analysis help readers understand how reconciliation affected the synthesis?"],
    ["Choosing a baseline for human and AI-assisted code review", "QUESTION", "An evaluation needs a realistic comparison condition. Should the baseline use unaided developers, existing static-analysis tools, or the team's normal review workflow?"],
    ["Sampling repositories for an empirical software-engineering study", "DISCUSSION", "Convenience samples are common but may overrepresent popular projects. Which sampling criteria make language, repository activity, and project maturity explicit without overstating generalizability?"],
    ["How should a replication package preserve data provenance?", "QUESTION", "We plan to publish transformation scripts and a metadata manifest. How should we preserve provider identifiers and screening decisions when the source cannot redistribute full texts?"],
    ["When does a pilot study justify a larger field evaluation?", "DISCUSSION", "Our pilot identifies practical issues with recruitment and measurement. I would welcome examples of feasibility criteria that guide a field study without turning preliminary estimates into effectiveness claims."],
  ] as const;
  const result = await prisma.forumPost.createMany({ skipDuplicates: true, data: fixtures.map(([title, type, body], index) => {
    const createdAt = new Date(Date.UTC(2026, 8, 10, 12 - index));
    return { id: `00000000-0000-4000-9000-${String(15 + index).padStart(12, "0")}`, authorId: author.id, communityId: community.id, title, type, body, status: "active", createdAt, lastActivityAt: createdAt };
  }) });
  const gap = await prisma.researchGap.upsert({
    where: { id: "00000000-0000-4000-8000-000000000025" },
    create: { id: "00000000-0000-4000-8000-000000000025", userId: author.id, source: "user", title: "Demo candidate: long-term effects of AI-assisted code review", topic: "AI-assisted code review", normalizedTopic: "demo-forum-longitudinal-code-review", description: "Development fixture for discussing a provisional research-gap candidate, not a validated literature finding.", rationale: "Demo context only. A formal literature search and evidence review are required before any validation claim.", forumShareable: true },
    update: {},
  });
  const gapTopic = await prisma.forumPost.createMany({ skipDuplicates: true, data: [{
    id: "00000000-0000-4000-9000-000000000023", authorId: author.id, communityId: community.id,
    type: "RESEARCH_GAP_DISCUSSION", title: "What evidence would address this candidate gap in long-term code review?",
    body: "This development discussion links a provisional, clearly labelled demo research-gap candidate. It does not assert that the literature has established or validated the gap.\n\nWhich populations, follow-up periods, and outcome measures should a formal evidence review consider? Please distinguish short-term task performance from sustained developer and team outcomes.\n\nRelevant papers can be cited here for discussion. They must still pass the existing screening and structured evidence workflow before becoming gap evidence.",
    linkedResearchGapId: gap.id, researchGapId: gap.id, status: "active", createdAt: new Date("2026-09-09T12:00:00Z"), lastActivityAt: new Date("2026-09-09T12:00:00Z"),
  }] });
  if (gapTopic.count) await prisma.forumPostGap.createMany({ skipDuplicates: true, data: [{ postId: "00000000-0000-4000-9000-000000000023", gapId: gap.id }] });
  const count = result.count + gapTopic.count;
  if (count) await prisma.community.update({ where: { id: community.id }, data: { threadCount: { increment: count } } });
  // Reuse real communities and academic context. Never overwrite existing topics/follows.
  const communities = await prisma.community.findMany({ where: { slug: { in: ["software-engineering", "artificial-intelligence", "research-methodology", "cybersecurity", "data-science", "information-systems"] }, status: "ACTIVE" }, orderBy: { slug: "asc" } });
  const paper = await prisma.paper.findFirst({ where: { dataStatus: "active" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, title: true } });
  if (!paper || communities.length !== 6) throw new Error("Existing academic communities and paper metadata are required for sidebar fixtures");
  const threadTypes = ["QUESTION", "DISCUSSION", "PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"] as const;
  let added = 0;
  for (const [communityIndex, current] of communities.entries()) {
    const membership = await prisma.communityMembership.findUnique({ where: { communityId_userId: { communityId: current.id, userId: author.id } } });
    if (membership?.status !== "active") throw new Error("Demo author must already belong to the seeded communities");
    for (const [typeIndex, type] of threadTypes.entries()) {
      const id = `00000000-0000-4000-9100-${String(communityIndex * 4 + typeIndex + 1).padStart(12, "0")}`;
      const createdAt = new Date(Date.UTC(2026, 8, 20, 12, communityIndex * 4 + typeIndex));
      const title = type === "QUESTION" ? `${current.name}: how should evaluation outcomes be defined?`
        : type === "DISCUSSION" ? `${current.name}: separating engagement from research quality`
          : type === "PAPER_DISCUSSION" ? `${current.name}: reviewing the evaluation design of a published study`
            : `${current.name}: which methods could test this demo candidate gap?`;
      const inserted = await prisma.$transaction(async (tx) => {
        const created = await tx.forumPost.createMany({ skipDuplicates: true, data: [{ id, authorId: author.id, communityId: current.id, type, title,
          body: type === "RESEARCH_GAP_DISCUSSION" ? "Development fixture: discuss how this provisional AI-assisted code-review candidate might be evaluated from this community's perspective. This is not a validated finding. Citations must pass formal screening and evidence review before entering gap evidence."
            : "Development fixture for academic discussion. Which populations, baselines, measurements, limitations, and replication material should a transparent evaluation report? Engagement here is not scientific validation.",
          linkedPaperId: type === "PAPER_DISCUSSION" ? paper.id : null,
          linkedResearchGapId: type === "RESEARCH_GAP_DISCUSSION" ? gap.id : null,
          researchGapId: type === "RESEARCH_GAP_DISCUSSION" ? gap.id : null,
          createdAt, lastActivityAt: createdAt } ] });
        if (!created.count) return 0;
        if (type === "PAPER_DISCUSSION") await tx.forumPostPaper.create({ data: { postId: id, paperId: paper.id, position: 0 } });
        if (type === "RESEARCH_GAP_DISCUSSION") await tx.forumPostGap.create({ data: { postId: id, gapId: gap.id } });
        if (type === "DISCUSSION") {
          const replyAt = new Date(createdAt.getTime() + 3600000);
          await tx.forumComment.create({ data: { postId: id, authorId: author.id, body: "A transparent protocol should distinguish task performance from long-term outcomes and document threats to validity.", createdAt: replyAt } });
          await tx.forumPost.update({ where: { id }, data: { commentCount: 1, lastActivityAt: replyAt } });
        }
        await tx.community.update({ where: { id: current.id }, data: { threadCount: { increment: 1 } } });
        return created.count;
      });
      added += inserted;
      if (type === "QUESTION" || type === "DISCUSSION") await prisma.forumThreadFollow.upsert({ where: { postId_userId: { postId: id, userId: author.id } }, create: { postId: id, userId: author.id }, update: {} });
    }
  }
  return count + added;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedForumPagination().then((count) => console.log(`Added ${count} pagination fixtures; existing records preserved.`)).catch((error) => { console.error(error); process.exitCode = 1; }).finally(disconnectPostgres);
}
