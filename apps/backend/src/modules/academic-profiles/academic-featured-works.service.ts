import type { AcademicFeaturedWork, AcademicFeaturedWorkInput, AcademicFeaturedWorkKind } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { canReadProjectContent, canReadProjectSummary } from "../projects/project-workspace.rules.js";

function whereId(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid work identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}
function mapById<T extends { id: string; legacyMongoId: string | null }>(rows: T[]) {
  const result = new Map<string, T>();
  for (const row of rows) { result.set(row.id, row); if (row.legacyMongoId) result.set(row.legacyMongoId, row); }
  return result;
}
function ids(works: AcademicFeaturedWorkInput[], key: "paperId" | "projectId" | "submissionId" | "reportId" | "gapId") {
  return works.flatMap(work => work[key] ? [whereId(work[key]!)] : []);
}

/** Resolve only safe summaries in bounded batches. Profile visibility never changes object access. */
export async function resolveFeaturedWorks(works: AcademicFeaturedWorkInput[], viewerInput?: string): Promise<AcademicFeaturedWork[]> {
  if (!works.length) return [];
  const db = getPrisma();
  const viewer = viewerInput ? await db.user.findUnique({ where: whereId(viewerInput), select: { id: true, isActive: true, accountStatus: true, emailVerifiedAt: true, systemRole: true } }) : null;
  const viewerId = viewer?.isActive && viewer.accountStatus === "ACTIVE" ? viewer.id : undefined;
  const researchViewerId = viewerId && (viewer?.emailVerifiedAt || viewer?.systemRole === "ADMIN") ? viewerId : undefined;
  const [papers, projects, submissions, gaps, memberships, reports] = await Promise.all([
    works.some(work => work.paperId) ? db.paper.findMany({ where: { OR: ids(works, "paperId") }, select: { id: true, legacyMongoId: true, title: true, doi: true, publicationYear: true, dataStatus: true, requestedById: true, uploadedById: true } }) : [],
    works.some(work => work.projectId) ? db.project.findMany({ where: { OR: ids(works, "projectId") }, select: { id: true, legacyMongoId: true, title: true, visibility: true, ownerId: true } }) : [],
    works.some(work => work.submissionId) ? db.submission.findMany({ where: { OR: ids(works, "submissionId") }, select: { id: true, legacyMongoId: true, title: true, submissionType: true, projectId: true } }) : [],
    works.some(work => work.gapId) ? db.researchGap.findMany({ where: { OR: ids(works, "gapId") }, select: { id: true, legacyMongoId: true, title: true, status: true, projectId: true, userId: true } }) : [],
    researchViewerId ? db.projectMember.findMany({ where: { userId: researchViewerId, status: "ACTIVE" }, select: { projectId: true } }) : [],
    works.some(work => work.reportId) ? db.report.findMany({ where: { OR: ids(works, "reportId") }, select: { id: true, legacyMongoId: true, title: true, artifactType: true, status: true, projectId: true, userId: true } }) : [],
  ]);
  const nestedProjectIds = [...new Set([...submissions.map(item => item.projectId), ...gaps.flatMap(item => item.projectId ? [item.projectId] : []), ...reports.flatMap(item => item.projectId ? [item.projectId] : [])])];
  const [nestedProjects, authors] = await Promise.all([
    nestedProjectIds.length ? db.project.findMany({ where: { id: { in: nestedProjectIds } }, select: { id: true, ownerId: true } }) : [],
    researchViewerId && submissions.length ? db.submissionAuthor.findMany({ where: { userId: researchViewerId, submissionId: { in: submissions.map(item => item.id) } }, select: { submissionId: true } }) : [],
  ]);
  const paperMap = mapById(papers), projectMap = mapById(projects), submissionMap = mapById(submissions), gapMap = mapById(gaps), reportMap = mapById(reports);
  const activeProjects = new Set(memberships.map(item => item.projectId));
  const nestedProjectMap = new Map(nestedProjects.map(item => [item.id, item]));
  const authored = new Set(authors.map(item => item.submissionId));
  const canReadNested = (id: string | null) => Boolean(id && nestedProjectMap.has(id) && canReadProjectContent(nestedProjectMap.get(id)!, researchViewerId, activeProjects));
  return works.flatMap((work): AcademicFeaturedWork[] => {
    const kind = work.kind ?? "PAPER";
    if (work.source !== "LUMIGAP") return [{ source: work.source, kind, title: work.title, doi: work.doi, year: work.year, canonical: false, visibility: "PUBLIC", ...(work.doi && /^10\.\d{4,9}\/\S+$/i.test(work.doi) ? { href: `https://doi.org/${encodeURIComponent(work.doi)}` } : {}) }];
    if (kind === "PAPER" && work.paperId) {
      const row = paperMap.get(work.paperId);
      if (!row || (row.dataStatus !== "active" && !(viewerId && [row.requestedById, row.uploadedById].includes(viewerId)))) return [];
      return [{ kind, source: "LUMIGAP", paperId: publicDatabaseId(row), title: row.title, doi: row.doi ?? undefined, year: row.publicationYear ?? undefined, canonical: true, visibility: row.dataStatus === "active" ? "PUBLIC" : "RESTRICTED", href: `/papers/${publicDatabaseId(row)}` }];
    }
    if (kind === "PROJECT" && work.projectId) {
      const row = projectMap.get(work.projectId);
      if (!row || !canReadProjectSummary(row.visibility, canReadProjectContent(row, researchViewerId, activeProjects))) return [];
      return [{ kind, source: "LUMIGAP", projectId: publicDatabaseId(row), title: row.title, canonical: true, visibility: row.visibility === "PUBLIC_SUMMARY" ? "PUBLIC" : "RESTRICTED", href: `/projects/${publicDatabaseId(row)}` }];
    }
    if (["RESEARCH_PROPOSAL", "RESEARCH_ARTIFACT"].includes(kind) && work.submissionId) {
      const row = submissionMap.get(work.submissionId);
      // Blind reviewer assignments deliberately do not disclose author attribution here.
      if (!row || !(researchViewerId && (authored.has(row.id) || canReadNested(row.projectId))) || (kind === "RESEARCH_PROPOSAL" && row.submissionType !== "RESEARCH_PROPOSAL")) return [];
      return [{ kind, source: "LUMIGAP", submissionId: publicDatabaseId(row), title: row.title, canonical: true, visibility: "RESTRICTED", href: `/submissions/${publicDatabaseId(row)}` }];
    }
    if (kind === "CANDIDATE_GAP" && work.gapId) {
      const row = gapMap.get(work.gapId);
      if (!row || row.status !== "active" || !(researchViewerId && (row.userId === researchViewerId || canReadNested(row.projectId)))) return [];
      return [{ kind, source: "LUMIGAP", gapId: publicDatabaseId(row), title: row.title, canonical: true, visibility: "RESTRICTED", href: `/research-gaps/${publicDatabaseId(row)}` }];
    }
    if (["RESEARCH_PROPOSAL", "RESEARCH_ARTIFACT"].includes(kind) && work.reportId) {
      const row = reportMap.get(work.reportId);
      if (!row || !row.title || row.status !== "ready" || !(researchViewerId && (row.userId === researchViewerId || canReadNested(row.projectId))) || (kind === "RESEARCH_PROPOSAL" && row.artifactType !== "RESEARCH_PROPOSAL")) return [];
      return [{ kind, source: "LUMIGAP", reportId: publicDatabaseId(row), title: row.title, canonical: true, visibility: "RESTRICTED", href: `/reports/${publicDatabaseId(row)}` }];
    }
    return [];
  });
}

export async function prepareFeaturedWorks(works: AcademicFeaturedWorkInput[], userId: string) {
  const resolved = await resolveFeaturedWorks(works, userId);
  if (resolved.length !== works.length) throw AppError.badRequest("One or more featured works are unavailable or inaccessible");
  const db = getPrisma();
  // Store internal IDs, never the supplied title/DOI of a linked private object.
  const [papers, projects, submissions, gaps, reports] = await Promise.all([
    works.some(item => item.paperId) ? db.paper.findMany({ where: { OR: ids(works, "paperId") }, select: { id: true, legacyMongoId: true } }) : [],
    works.some(item => item.projectId) ? db.project.findMany({ where: { OR: ids(works, "projectId") }, select: { id: true, legacyMongoId: true } }) : [],
    works.some(item => item.submissionId) ? db.submission.findMany({ where: { OR: ids(works, "submissionId") }, select: { id: true, legacyMongoId: true } }) : [],
    works.some(item => item.gapId) ? db.researchGap.findMany({ where: { OR: ids(works, "gapId") }, select: { id: true, legacyMongoId: true } }) : [],
    works.some(item => item.reportId) ? db.report.findMany({ where: { OR: ids(works, "reportId") }, select: { id: true, legacyMongoId: true } }) : [],
  ]);
  const maps = { paperId: mapById(papers), projectId: mapById(projects), submissionId: mapById(submissions), gapId: mapById(gaps), reportId: mapById(reports) };
  return works.map(work => ({ source: work.source, kind: work.kind ?? "PAPER", paperId: work.paperId ? maps.paperId.get(work.paperId)!.id : null, projectId: work.projectId ? maps.projectId.get(work.projectId)!.id : null, submissionId: work.submissionId ? maps.submissionId.get(work.submissionId)!.id : null, gapId: work.gapId ? maps.gapId.get(work.gapId)!.id : null, reportId: work.reportId ? maps.reportId.get(work.reportId)!.id : null, title: work.source === "LUMIGAP" ? null : work.title ?? null, doi: work.source === "LUMIGAP" ? null : work.doi ?? null, year: work.source === "LUMIGAP" ? null : work.year ?? null }));
}

export async function featuredWorkOptions(userId: string, kind: AcademicFeaturedWorkKind, q: string) {
  const db = getPrisma();
  const user = await db.user.findUnique({ where: whereId(userId), select: { id: true } });
  if (!user) throw AppError.unauthorized();
  const memberships = await db.projectMember.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { projectId: true } });
  const owned = await db.project.findMany({ where: { ownerId: user.id }, select: { id: true } });
  const projectIds = [...new Set([...owned.map(item => item.id), ...memberships.map(item => item.projectId)])];
  const title = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const base = { take: 10, orderBy: { updatedAt: "desc" as const } };
  let works: AcademicFeaturedWorkInput[] = [];
  if (kind === "PAPER") works = (await db.paper.findMany({ where: { ...(title ? { title } : {}), OR: [{ dataStatus: "active" }, { requestedById: user.id }, { uploadedById: user.id }] }, take: 10, orderBy: { updatedAt: "desc" }, select: { id: true } })).map(item => ({ kind, paperId: item.id, source: "LUMIGAP" }));
  if (kind === "PROJECT") works = (await db.project.findMany({ ...base, where: { ...(title ? { title } : {}), OR: [{ id: { in: projectIds } }, { visibility: "PUBLIC_SUMMARY" }] }, select: { id: true } })).map(item => ({ kind, projectId: item.id, source: "LUMIGAP" }));
  if (kind === "RESEARCH_PROPOSAL" || kind === "RESEARCH_ARTIFACT") {
    const authors = await db.submissionAuthor.findMany({ where: { userId: user.id }, select: { submissionId: true } });
    works = (await db.submission.findMany({ ...base, where: { ...(title ? { title } : {}), ...(kind === "RESEARCH_PROPOSAL" ? { submissionType: "RESEARCH_PROPOSAL" } : {}), OR: [{ projectId: { in: projectIds } }, { id: { in: authors.map(item => item.submissionId) } }] }, select: { id: true } })).map(item => ({ kind, submissionId: item.id, source: "LUMIGAP" }));
    works.push(...(await db.report.findMany({ ...base, where: { ...(title ? { title } : {}), status: "ready", ...(kind === "RESEARCH_PROPOSAL" ? { artifactType: "RESEARCH_PROPOSAL" } : {}), OR: [{ userId: user.id }, { projectId: { in: projectIds } }] }, select: { id: true } })).map(item => ({ kind, reportId: item.id, source: "LUMIGAP" as const })));
  }
  if (kind === "CANDIDATE_GAP") works = (await db.researchGap.findMany({ ...base, where: { ...(title ? { title } : {}), status: "active", OR: [{ userId: user.id }, { projectId: { in: projectIds } }] }, select: { id: true } })).map(item => ({ kind, gapId: item.id, source: "LUMIGAP" }));
  return (await resolveFeaturedWorks(works, user.id)).slice(0, 10);
}
