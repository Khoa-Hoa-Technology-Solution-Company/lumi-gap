import type { LecturerMatchEvidence, PublicAcademicProfile, MentorshipApplicationInput } from "@trend/shared-types";
import { TECHNICAL_SKILLS } from "@trend/shared-types";
import { academicProfileService } from "../academic-profiles/academic-profile.service.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Requirements = { topics: string[]; methodologies: string[]; needs: string };
type Publication = LecturerMatchEvidence["publications"][number];
const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => normalize(a) === normalize(b);
export function containsEvidenceTerm(text: string, term: string) {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(escaped && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(normalize(text)));
}
export function safeEvidenceLink(value?: string | null): string | undefined {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function buildLecturerMatch(requirements: Requirements, application: Pick<MentorshipApplicationInput, "areas" | "methodologies" | "capabilities">, profile?: PublicAcademicProfile, linked: Publication[] = [], verifiedLecturer = false): LecturerMatchEvidence {
  const topics: LecturerMatchEvidence["topics"] = [];
  const requestedTopics = [...new Set(requirements.topics.filter(Boolean))];
  for (const term of requestedTopics) {
    if ([...profile?.expertiseAreas ?? [], ...profile?.researchInterests ?? [], ...profile?.researchSpecializations ?? [], ...profile?.skills ?? [], ...profile?.researchKeywords ?? [], ...profile?.researchClassification?.nodes.map(node => node.name) ?? [], ...profile?.researchClassification?.keywords.map(keyword => keyword.name) ?? [], ...profile?.researchClassification?.skillIds.map(id => TECHNICAL_SKILLS.find(skill => skill.id === id)?.label ?? id) ?? []].some(value => same(value, term))) topics.push({ term, source: "PROFILE_DECLARATION" });
    if (application.areas.some(value => same(value, term))) topics.push({ term, source: "APPLICATION_DECLARATION" });
  }
  // Featuring a paper is a claim of attribution, even if its metadata is canonical.
  const featured: Publication[] = (profile?.featuredWorks ?? []).filter(work => work.visibility === "PUBLIC" && (work.kind ?? "PAPER") === "PAPER" && work.title).map(work => ({ title: work.title!, year: work.year, source: work.source, href: safeEvidenceLink(work.href), matchedTerms: requestedTopics.filter(term => containsEvidenceTerm(work.title!, term)), attribution: "SELF_DECLARED" }));
  const publications = [...linked, ...featured].filter(work => work.matchedTerms.length).filter((work, index, all) => all.findIndex(other => same(other.title, work.title)) === index).slice(0, 8);
  for (const term of requestedTopics.filter(term => publications.some(work => work.matchedTerms.includes(term)))) topics.push({ term, source: "PUBLICATION_TITLE" });
  const methodologies = requirements.methodologies.filter(term => application.methodologies.some(value => same(value, term)));
  const mentoringNeeds = application.capabilities.filter(term => containsEvidenceTerm(requirements.needs, term));
  const identities = (profile?.academicIdentityLinks ?? []).flatMap(link => {
    const href = safeEvidenceLink(link.profileUrl); return href ? [{ provider: String(link.provider), href, verified: link.verificationStatus === "PROVIDER_CONNECTED" && ["OAUTH", "SYSTEM", "ADMIN"].includes(link.connectionMethod) }] : [];
  });
  const missing = [
    ...(!profile ? ["Academic profile is private or unavailable."] : []),
    ...(!topics.length ? ["No shared research topics were established from available evidence."] : []),
    ...(!requirements.methodologies.length ? ["The project has not specified required methodologies."] : requirements.methodologies.filter(term => !methodologies.includes(term)).map(term => `Methodology not established: ${term}`)),
    ...(!publications.length ? ["No relevant public publications are available in the local evidence."] : []),
    ...(!linked.length ? ["Publication authorship has not been established through a verified public identity."] : []),
    "Declared expertise and availability are not independent assessments of mentoring quality.",
    "Relevance uses explicit terms and publication titles; absence of a match is not proof of missing expertise.",
  ];
  return { method: "STRUCTURED_TERMS_V1", profileVisible: Boolean(profile), verifiedLecturer, topics, methodologies, mentoringNeeds, publications, identities, missing, requestedTopics, requestedMethodologies: requirements.methodologies };
}
/** Only stored public evidence: no outbound call, LLM, name matching, or publication metrics. */
export async function lecturerMatchEvidence(lecturerId: string, viewerId: string, requirements: Requirements, application: Pick<MentorshipApplicationInput, "areas" | "methodologies" | "capabilities">, verifiedLecturer: boolean) {
  let profile: PublicAcademicProfile | undefined;
  try { profile = await academicProfileService.getPublic(lecturerId, viewerId); }
  catch (error) { if (!(error instanceof AppError && [403, 404].includes(error.statusCode))) throw error; }
  const verified = (profile?.academicIdentityLinks ?? []).filter(link => !link.profileUrl?.startsWith("https://sandbox.orcid.org/") && link.verificationStatus === "PROVIDER_CONNECTED" && ["OAUTH", "SYSTEM", "ADMIN"].includes(link.connectionMethod) && ["ORCID", "OPENALEX"].includes(String(link.provider)));
  const authorQueries: Prisma.AuthorWhereInput[] = verified.flatMap((link): Prisma.AuthorWhereInput[] => {
    const identifier = link.identifier?.replace(/^https:\/\/orcid.org\//, "");
    if (link.provider === "ORCID" && identifier && /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(identifier)) return [{ orcid: { in: [identifier, `https://orcid.org/${identifier}`] } }];
    const openAlexId = link.identifier?.replace(/^https:\/\/openalex.org\//, "");
    if (link.provider === "OPENALEX" && openAlexId && /^A\d+$/.test(openAlexId)) return [{ openalexId: { in: [openAlexId, `https://openalex.org/${openAlexId}`] } }];
    return [];
  });
  const db = getPrisma();
  const authors = authorQueries.length ? await db.author.findMany({ where: { OR: authorQueries }, select: { id: true } }) : [];
  const authorships = authors.length ? await db.paperAuthor.findMany({ where: { authorId: { in: authors.map(author => author.id) } }, take: 500, select: { paperId: true }, orderBy: { paperId: "asc" } }) : [];
  const papers = authorships.length && requirements.topics.length ? await db.paper.findMany({ where: { id: { in: authorships.map(author => author.paperId) }, dataStatus: "active", OR: requirements.topics.map(term => ({ title: { contains: term, mode: "insensitive" as const } })) }, select: { title: true, publicationYear: true, doi: true, paperLink: true, primaryProvider: true }, take: 20, orderBy: [{ publicationYear: "desc" }, { id: "asc" }] }) : [];
  const linked: Publication[] = papers.map(paper => ({ title: paper.title, year: paper.publicationYear, source: paper.primaryProvider, href: safeEvidenceLink(paper.doi ? `https://doi.org/${paper.doi}` : paper.paperLink), matchedTerms: requirements.topics.filter(term => containsEvidenceTerm(paper.title, term)), attribution: "LINKED_IDENTITY" }));
  return buildLecturerMatch(requirements, application, profile, linked, verifiedLecturer);
}
