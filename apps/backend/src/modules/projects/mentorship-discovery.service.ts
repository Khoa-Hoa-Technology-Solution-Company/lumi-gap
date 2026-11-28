import { normalizeAcademicExpertise, normalizeTechnicalSkill, TECHNICAL_SKILLS, type MentorRole, type ResearchSupportType } from "@trend/shared-types";
import { readResearchClassification } from "../taxonomy/research-classification.service.js";
import { explainMentorRelevance } from "./mentor-relevance.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { AcademicProfile, Project, User } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { env } from "../../config/env.js";
import { mentorshipPolicy } from "./mentorship-positions.js";
import { pageMeta, mentorshipPreview, mentorshipTeamCounts, type AcademicSearch } from "./project-mentorship.service.js";
import { parseMentorshipProfile } from "./mentorship-two-way.js";
import { analyzeResearchNeedsDeterministic, buildAuthorizedNeedsContext } from "./research-needs-analysis.service.js";
import { batchLoadLecturerPublications, evaluateCandidateRecommendation, tryEmbedQueryText, type CandidatePublicationInput } from "./mentor-recommendation.engine.js";

const termsArray = (terms: string[]) => {
  const unique = [...new Set(terms.map(s => s.trim().toLowerCase()).filter(Boolean))];
  return unique.length ? Prisma.sql`ARRAY[${Prisma.join(unique)}]::text[]` : Prisma.sql`ARRAY[]::text[]`;
};
const pattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const overlap = (profileTerms: string[], wanted: string[]) => profileTerms.filter(term => wanted.some(w => w.toLocaleLowerCase() === term.toLocaleLowerCase()));

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function readSupportMeta(raw: unknown) {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const types = readStringArray(obj.types) as ResearchSupportType[];
  const preferredTopics = readStringArray(obj.preferredTopics);
  const preferredTopicIds = readStringArray(obj.preferredTopicIds);
  const preferredRoles = readStringArray(obj.preferredRoles).filter((r): r is "PRIMARY" | "SECONDARY" => r === "PRIMARY" || r === "SECONDARY");
  const expectedFrequency = typeof obj.expectedFrequency === "string" && obj.expectedFrequency.trim() ? obj.expectedFrequency.trim() : undefined;
  const expectedDuration = typeof obj.expectedDuration === "string" && obj.expectedDuration.trim() ? obj.expectedDuration.trim() : undefined;
  const communicationMode = typeof obj.communicationMode === "string" && obj.communicationMode.trim() ? obj.communicationMode.trim() : undefined;
  const maxActiveProjects = typeof obj.maxActiveProjects === "number" && Number.isInteger(obj.maxActiveProjects) && obj.maxActiveProjects > 0
    ? obj.maxActiveProjects
    : null;
  return { types, preferredTopics, preferredTopicIds, preferredRoles, expectedFrequency, expectedDuration, communicationMode, maxActiveProjects };
}

export const mentorshipDiscoveryService = {
  async mentors(project: Project | null, owner: User, query: AcademicSearch) {
    const configured = project ? [...project.mentorshipResearchAreas, ...project.mentorshipExpertise, ...project.mentorshipMethodologies] : [];
    const db = getPrisma(), meta = pageMeta(0, query);
    const plan = project
      ? await db.researchPlan.findUnique({
          where: { projectId: project.id },
          select: { approach: true, problem: true, objectives: true, questions: true, scope: true, methodology: true, searchStrategy: true },
        })
      : null;
    const projectKeywords = project?.researchKeywords?.length
      ? project.researchKeywords
      : (plan?.searchStrategy?.split(/[,;\n]/) ?? []);
    const wanted = [...new Set((configured.length ? configured : [project?.researchField ?? query.area ?? "", ...(project?.researchAreas ?? []), ...projectKeywords]).map(term => term.trim()).filter(term => term.length > 0 && term.length <= 120))];
    const wantedMethods = [...new Set((project?.mentorshipMethodologies ?? []).map(m => m.trim()).filter(Boolean))];
    const classification = readResearchClassification(project?.researchClassification);
    const wantedNodeIds = (level: string) => classification?.nodes.filter(node => node.level === level).map(node => node.id) ?? [];
    const skillKey = Prisma.sql`CASE ${Prisma.join(TECHNICAL_SKILLS.map(skill => Prisma.sql`WHEN LOWER(TRIM(t))=ANY(${termsArray([skill.id, skill.label, ...skill.aliases])}) THEN ${skill.id}`), " ")} ELSE LOWER(TRIM(t)) END`;
    const wantedSkills = [...(classification?.skillIds ?? []), ...wanted.map(normalizeTechnicalSkill)];
    const cooldownSince = new Date(Date.now() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000);
    const exactEmail = query.q && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.q.trim()) ? query.q.trim().toLowerCase() : null;
    const projectExclusions = project ? Prisma.sql`
        AND NOT EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=${project.id}::uuid AND pm.user_id=u.id AND pm.status='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM mentorship_requests r WHERE r.project_id=${project.id}::uuid AND r.mentor_user_id=u.id AND r.status IN ('DECLINED','CANCELLED','CANCELED_BY_PROJECT') AND r.responded_at>${cooldownSince})` : Prisma.sql``;
    const emailFilter = exactEmail ? Prisma.sql`AND (LOWER(u.email)=${exactEmail} OR EXISTS(SELECT 1 FROM user_emails ue WHERE ue.user_id=u.id AND ue.normalized_email=${exactEmail} AND ue.verified_at IS NOT NULL))` : Prisma.sql``;
    // Only visible fields participate in filtering/matching (plus exact verified email lookup without exposing emails in results).
    const candidates = Prisma.sql`SELECT u.id, COALESCE(u.legacy_mongo_id,u.id::text) AS public_id, u.full_name, u.avatar_url, u.institution,
      p.position_title,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.research_classification ELSE '{}'::jsonb END AS classification,
      p.support_availability AS support,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.expertise_areas ELSE ARRAY[]::text[] END AS areas,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.research_specializations ELSE ARRAY[]::text[] END AS specializations,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.skills ELSE ARRAY[]::text[] END AS skills,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.privacy_settings->'researchMethods')='array' THEN p.privacy_settings->'researchMethods' ELSE '[]'::jsonb END)) ELSE ARRAY[]::text[] END AS methods,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.research_keywords || ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.support_availability->'preferredTopics')='array' THEN p.support_availability->'preferredTopics' ELSE '[]'::jsonb END)) ELSE ARRAY[]::text[] END AS keywords,
      CASE WHEN COALESCE(p.privacy_settings->>'researchInterests','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN u.research_interests ELSE ARRAY[]::text[] END AS interests
      FROM users u JOIN academic_profiles p ON p.user_id=u.id
      WHERE u.is_active AND u.account_status='ACTIVE' AND u.email_verified_at IS NOT NULL
        AND p.academic_role='LECTURER' AND p.role_verification_status='VERIFIED' AND p.position_status='VERIFIED'
        AND p.profile_visibility IN ('PUBLIC','MEMBERS_ONLY') AND p.show_in_researcher_search AND p.allow_collaboration_requests
        AND p.support_availability->>'enabled'='true' AND u.id<>${owner.id}::uuid
        ${emailFilter}
        ${projectExclusions}`;
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (query.q && !exactEmail) conditions.push(Prisma.sql`(full_name ILIKE ${pattern(query.q)} OR institution ILIKE ${pattern(query.q)} OR position_title ILIKE ${pattern(query.q)} OR EXISTS(SELECT 1 FROM unnest(areas||interests||specializations||skills||methods||keywords) t WHERE t ILIKE ${pattern(query.q)}) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'name' ILIKE ${pattern(query.q)}))`);
    if (query.institution) conditions.push(Prisma.sql`institution ILIKE ${pattern(query.institution)}`);
    if (query.position) conditions.push(Prisma.sql`position_title ILIKE ${pattern(query.position)}`);
    if (query.area) conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM unnest(areas) t WHERE LOWER(t)=LOWER(${query.area})) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'=${"field"} AND (LOWER(node->>'name')=LOWER(${query.area}) OR node->>'id'=${query.area})))`);
    if (query.specialization) conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM unnest(specializations) t WHERE LOWER(t)=LOWER(${query.specialization})) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'=${"subfield"} AND (LOWER(node->>'name')=LOWER(${query.specialization}) OR node->>'id'=${query.specialization})))`);
    if (query.technology) conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM unnest(skills) t WHERE ${skillKey}=${normalizeTechnicalSkill(query.technology)}) OR COALESCE(classification->'skillIds','[]'::jsonb) ? ${normalizeTechnicalSkill(query.technology)})`);
    if (query.interest) conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM unnest(interests) t WHERE LOWER(t)=LOWER(${query.interest})) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'=${"topic"} AND (LOWER(node->>'name')=LOWER(${query.interest}) OR node->>'id'=${query.interest})))`);
    const filtered = Prisma.sql`WITH visible AS (${candidates}) SELECT * FROM visible WHERE ${Prisma.join(conditions, " AND ")}`;
    type Row = { id: string; public_id: string; full_name: string; avatar_url: string | null; institution: string | null; position_title: string | null; areas: string[]; interests: string[]; specializations: string[]; skills: string[]; methods: string[]; keywords: string[]; classification: unknown; support: unknown };

    const totalPoolLimit = project ? Math.min(120, Math.max(meta.page * meta.pageSize, 60)) : meta.pageSize;
    const sqlOffset = project ? 0 : (meta.page - 1) * meta.pageSize;

    // Bounded relevance retrieval before hybrid need-level reranking and pagination.
    const [count, poolRows] = await db.$transaction([
      db.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS total FROM (${filtered}) result`),
      db.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM (${filtered}) result ORDER BY
        LEAST(3, (SELECT COUNT(DISTINCT node->>'id') FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'='topic' AND node->>'id'=ANY(${termsArray(wantedNodeIds("topic"))}))) DESC,
        LEAST(3, ((SELECT COUNT(DISTINCT node->>'id') FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'='subfield' AND node->>'id'=ANY(${termsArray(wantedNodeIds("subfield"))})) + (SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(specializations) t WHERE LOWER(t)=ANY(${termsArray(wanted)})))) DESC,
        LEAST(3, ((SELECT COUNT(DISTINCT node->>'id') FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'='field' AND node->>'id'=ANY(${termsArray(wantedNodeIds("field"))})) + (SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(areas) t WHERE LOWER(t)=ANY(${termsArray(wanted)})))) DESC,
        LEAST(3, (SELECT COUNT(DISTINCT LOWER(m)) FROM unnest(methods) m WHERE LOWER(m)=ANY(${termsArray(wantedMethods)}))) DESC,
        LEAST(3, (SELECT COUNT(DISTINCT skill) FROM (SELECT ${skillKey} AS skill FROM unnest(skills) t UNION SELECT jsonb_array_elements_text(COALESCE(classification->'skillIds','[]'::jsonb))) matched WHERE skill=ANY(${termsArray(wantedSkills)}))) DESC,
        LEAST(3, ((SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(interests||keywords) t WHERE LOWER(t)=ANY(${termsArray(wanted)})) + (SELECT COUNT(DISTINCT keyword_id) FROM jsonb_array_elements_text(COALESCE(classification->'keywordIds','[]'::jsonb)) keyword_id WHERE keyword_id=ANY(${termsArray(classification?.keywordIds ?? [])})))) DESC,
        LEAST(3, (SELECT COUNT(DISTINCT supervised) FROM jsonb_array_elements_text(COALESCE(support->'preferredTopicIds','[]'::jsonb)) supervised WHERE supervised=ANY(${termsArray(wantedNodeIds("topic"))}))) DESC,
        LEAST(3, (SELECT COUNT(DISTINCT LOWER(support_type)) FROM jsonb_array_elements_text(COALESCE(support->'types','[]'::jsonb)) support_type WHERE LOWER(support_type)=ANY(${termsArray((project?.mentorshipSupportTypes ?? []).map(type => type.toLowerCase()))}))) DESC,
        LOWER(full_name) ASC, id ASC LIMIT ${totalPoolLimit} OFFSET ${sqlOffset}`),
    ], { isolationLevel: "RepeatableRead" });

    const candidateIds = poolRows.map(r => r.id);
    const [pending, active, liveActiveCountsRows, completedCountsRows, publicationsByLecturer] = candidateIds.length
      ? await Promise.all([
          project
            ? db.mentorshipRequest.findMany({ where: { projectId: project.id, mentorUserId: { in: candidateIds }, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true, mentorUserId: true, direction: true } })
            : Promise.resolve([]),
          project
            ? db.mentorRelationship.findMany({ where: { projectId: project.id, mentorUserId: { in: candidateIds }, status: "ACTIVE" }, select: { mentorUserId: true, sourceRequestId: true } })
            : Promise.resolve([]),
          db.$queryRaw<Array<{ mentor_user_id: string; cnt: number }>>(Prisma.sql`
            SELECT mr.mentor_user_id::text, COUNT(DISTINCT mr.project_id)::int AS cnt
            FROM mentor_relationships mr
            JOIN projects pr ON pr.id = mr.project_id AND pr.deleted_at IS NULL
            WHERE mr.mentor_user_id = ANY(${candidateIds}::uuid[]) AND mr.status = 'ACTIVE'
            GROUP BY mr.mentor_user_id
          `),
          db.$queryRaw<Array<{ mentor_user_id: string; cnt: number }>>(Prisma.sql`
            SELECT mr.mentor_user_id::text, COUNT(*)::int AS cnt
            FROM mentor_relationships mr
            WHERE mr.mentor_user_id = ANY(${candidateIds}::uuid[]) AND mr.status = 'ENDED'
            GROUP BY mr.mentor_user_id
          `),
          project
            ? batchLoadLecturerPublications(candidateIds, { includeEmbeddings: true, maxPapersPerLecturer: 10 })
            : Promise.resolve(new Map<string, CandidatePublicationInput[]>()),
        ])
      : [[], [], [], [], new Map<string, CandidatePublicationInput[]>()];

    const activeCountByLecturer = new Map(liveActiveCountsRows.map(r => [r.mentor_user_id, r.cnt]));
    const completedCountByLecturer = new Map(completedCountsRows.map(r => [r.mentor_user_id, r.cnt]));

    // Build project-level research needs & optional compatible semantic query embedding
    let projectRecCtx: ReturnType<typeof buildAuthorizedNeedsContext> | null = null;
    let projectNeeds: import("@trend/shared-types").ResearchSupportNeed[] = [];
    let projectQueryEmbedding: number[] | null = null;
    let coveredNeedIdsByActiveMentors: string[] = [];

    if (project) {
      projectRecCtx = buildAuthorizedNeedsContext(project, plan, "vi");
      const savedNeeds = projectRecCtx.profile.researchSupportNeeds ?? [];
      projectNeeds = savedNeeds.length > 0 ? savedNeeds : analyzeResearchNeedsDeterministic(projectRecCtx, { locale: "vi" });

      // Detect needs already confirmed by active mentors for optional complementary recommendations
      if (active.length > 0) {
        const activeReqRows = await db.mentorshipRequest.findMany({
          where: { id: { in: active.map(a => a.sourceRequestId) } },
          select: { termsSnapshot: true },
        });
        coveredNeedIdsByActiveMentors = [...new Set(activeReqRows.flatMap(r => {
          const t = r.termsSnapshot as { needConfirmations?: Array<{ needId: string; response: string }> } | null;
          return (t?.needConfirmations ?? []).filter(nc => nc.response === "CAN_SUPPORT").map(nc => nc.needId);
        }))];
      }

      const anyEmbeddedPub = [...publicationsByLecturer.values()].some(list => list.some(pub => Boolean(pub.embedding?.length)));
      if (anyEmbeddedPub && projectRecCtx.combinedText.trim().length >= 15) {
        projectQueryEmbedding = await tryEmbedQueryText(projectRecCtx.combinedText.slice(0, 1200));
      }
    }

    const enriched = poolRows.map(r => {
      const supportMeta = readSupportMeta(r.support);
      const pendingMatch = pending.find(p => p.mentorUserId === r.id);
      const activeMatch = active.some(a => a.mentorUserId === r.id);
      const activeProjectCount = activeCountByLecturer.get(r.id) ?? 0;
      const maxActiveProjects = supportMeta.maxActiveProjects;
      const remainingSlots = maxActiveProjects !== null ? Math.max(0, maxActiveProjects - activeProjectCount) : null;
      const capacityReached = maxActiveProjects !== null && activeProjectCount >= maxActiveProjects;
      const candidateClassification = readResearchClassification(r.classification);

      const scored = project && projectRecCtx
        ? evaluateCandidateRecommendation(
            {
              projectId: project.id,
              publicProjectId: publicDatabaseId(project),
              stage: projectRecCtx.stage,
              classification,
              wantedTerms: wanted,
              wantedMethods,
              wantedSupportTypes: (project.mentorshipSupportTypes ?? []) as ResearchSupportType[],
              needs: projectNeeds,
              coveredNeedIdsByActiveMentors,
              hasSufficientContext: projectRecCtx.contextSummary.completeness !== "SPARSE",
              locale: "vi",
            },
            {
              lecturerId: r.id,
              publicId: r.public_id,
              fullName: r.full_name,
              institutionName: r.institution ?? undefined,
              positionTitle: r.position_title ?? undefined,
              verifiedLecturer: true,
              profileVisible: true,
              acceptingNew: true,
              allowCollaborationRequests: true,
              activeProjectCount,
              maxActiveProjects,
              completedMentorshipCount: completedCountByLecturer.get(r.id) ?? 0,
              ...(activeMatch ? { mentorshipStatus: "ACTIVE" as const } : pendingMatch ? { mentorshipStatus: "PENDING" as const, pendingRequestDirection: pendingMatch.direction as "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT" } : {}),
              classification: candidateClassification,
              expertiseAreas: r.areas,
              researchSpecializations: r.specializations,
              skills: r.skills,
              researchMethods: r.methods,
              researchKeywords: r.keywords,
              researchInterests: r.interests,
              supportTypes: supportMeta.types,
              preferredTopics: supportMeta.preferredTopics,
              preferredTopicIds: supportMeta.preferredTopicIds,
              preferredRoles: supportMeta.preferredRoles,
              publications: publicationsByLecturer.get(r.id) ?? [],
            },
            { projectQueryEmbedding },
          )
        : null;

      return {
        scored,
        dto: {
          _id: r.public_id, fullName: r.full_name, avatarUrl: r.avatar_url ?? undefined, institutionName: r.institution ?? undefined,
          positionTitle: r.position_title ?? undefined, academicRole: "LECTURER", verifiedLecturer: true, acceptingMentorships: true as const,
          capacityReached,
          remainingSlots,
          maxActiveProjects,
          activeProjectCount,
          isDemo: /(?:\(demo\)|\bdemo\b)/i.test(`${r.full_name} ${r.institution ?? ""}`),
          ...(activeMatch
            ? { mentorshipStatus: "ACTIVE" as const }
            : pendingMatch
              ? {
                  mentorshipStatus: "PENDING" as const,
                  pendingRequestId: pendingMatch.id,
                  pendingRequestDirection: pendingMatch.direction as "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT",
                }
              : {}),
          expertiseAreas: r.areas, researchInterests: r.interests, researchSpecializations: r.specializations, skills: r.skills, researchMethods: r.methods, researchKeywords: r.keywords,
          ...(supportMeta.types.length ? { supportTypes: supportMeta.types } : {}),
          ...(supportMeta.preferredRoles.length ? { preferredRoles: supportMeta.preferredRoles } : {}),
          ...(supportMeta.expectedFrequency ? { expectedFrequency: supportMeta.expectedFrequency } : {}),
          ...(supportMeta.expectedDuration ? { expectedDuration: supportMeta.expectedDuration } : {}),
          ...(supportMeta.communicationMode ? { communicationMode: supportMeta.communicationMode } : {}),
          matchedTerms: [...new Set(overlap([...r.areas, ...r.interests, ...r.specializations, ...r.skills, ...r.methods, ...r.keywords], wanted))],
          matchExplanation: explainMentorRelevance({ classification, terms: wanted, supportTypes: project?.mentorshipSupportTypes ?? [] }, { classification: candidateClassification, areas: r.areas, specializations: r.specializations, skills: r.skills, interests: r.interests, keywords: r.keywords, supportTypes: supportMeta.types, preferredTopics: supportMeta.preferredTopics, preferredTopicIds: supportMeta.preferredTopicIds }),
          ...(scored ? { recommendation: scored.recommendation } : {}),
          sameInstitution: Boolean(owner.institution && r.institution?.toLowerCase() === owner.institution.toLowerCase()),
        },
      };
    });

    const tierRank = (t?: string) => (t === "RECOMMENDED" ? 0 : t === "EXPLORE" ? 1 : 2);
    if (project) {
      enriched.sort((a, b) => {
        const invA = a.scored?.recommendation.eligibility.canInvite ? 0 : 1;
        const invB = b.scored?.recommendation.eligibility.canInvite ? 0 : 1;
        if (invA !== invB) return invA - invB;
        const trA = tierRank(a.scored?.recommendation.tier);
        const trB = tierRank(b.scored?.recommendation.tier);
        if (trA !== trB) return trA - trB;
        const scoreDiff = (b.scored?.internalScore ?? 0) - (a.scored?.internalScore ?? 0);
        if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
        return a.dto.fullName.toLocaleLowerCase().localeCompare(b.dto.fullName.toLocaleLowerCase()) || a.dto._id.localeCompare(b.dto._id);
      });
    }

    const sliced = project
      ? enriched.slice((meta.page - 1) * meta.pageSize, meta.page * meta.pageSize)
      : enriched;

    return {
      items: sliced.map(entry => entry.dto),
      meta: pageMeta(Number(count[0]?.total ?? 0), query),
    };
  },
  async opportunities(lecturer: User, profile: AcademicProfile, query: AcademicSearch) {
    const db = getPrisma(), meta = pageMeta(0, query);
    const supportMeta = readSupportMeta(profile.supportAvailability);
    const privacy = profile.privacySettings && typeof profile.privacySettings === "object" && !Array.isArray(profile.privacySettings)
      ? (profile.privacySettings as Record<string, unknown>)
      : {};
    const normalized = normalizeAcademicExpertise({
      expertiseAreas: profile.expertiseAreas,
      researchSpecializations: profile.researchSpecializations,
      researchInterests: lecturer.researchInterests,
      skills: profile.skills,
      researchMethods: readStringArray(privacy.researchMethods),
      researchKeywords: profile.researchKeywords,
    });
    const classification = readResearchClassification(profile.researchClassification);
    const lecturerNodeIds = (level: string) => classification?.nodes.filter(node => node.level === level).map(node => node.id) ?? [];
    const lecturerTopics = [...new Set([...lecturerNodeIds("topic"), ...supportMeta.preferredTopicIds])];
    const lecturerSubfields = lecturerNodeIds("subfield");
    const lecturerFields = lecturerNodeIds("field");
    const lecturerKeywords = classification?.keywordIds ?? [];
    const lecturerSkills = [...new Set([...(classification?.skillIds ?? []), ...normalized.skills.map(normalizeTechnicalSkill)])];
    const lecturerMethods = normalized.researchMethods;
    const lecturerSupportTypes = supportMeta.types.map(t => t.toLowerCase());
    const wantedTerms = [...new Set([...normalized.researchAreas, ...supportMeta.preferredTopics, ...profile.expertiseAreas, ...profile.researchSpecializations, ...profile.researchKeywords, ...lecturer.researchInterests])];
    const cooldownSince = new Date(Date.now() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000);
    const conditions = [
      Prisma.sql`p.deleted_at IS NULL AND p.mentorship_discovery='SEEKING_MENTOR' AND p.status NOT IN ('ARCHIVED','COMPLETED') AND p.owner_id<>${lecturer.id}::uuid`,
      Prisma.sql`(SELECT COUNT(*) FROM mentor_relationships m WHERE m.project_id=p.id AND m.status='ACTIVE')<${mentorshipPolicy.maxActiveMentors}`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentorship_applications app WHERE app.project_id=p.id AND app.lecturer_id=${lecturer.id}::uuid AND app.status IN ('APPLIED','SHORTLISTED','INVITED','ACCEPTED'))`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentor_invitation_plans plan WHERE plan.project_id=p.id AND plan.status='ACTIVE' AND 'PRIMARY'=ANY(plan.closed_roles) AND 'SECONDARY'=ANY(plan.closed_roles))`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=${lecturer.id}::uuid AND pm.status='ACTIVE')`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentor_relationships mr WHERE mr.project_id=p.id AND mr.mentor_user_id=${lecturer.id}::uuid AND mr.status='ACTIVE')`,
      Prisma.sql`EXISTS(SELECT 1 FROM users owner WHERE owner.id=p.owner_id AND owner.is_active AND owner.account_status='ACTIVE' AND owner.email_verified_at IS NOT NULL)`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentorship_requests r WHERE r.project_id=p.id AND r.mentor_user_id=${lecturer.id}::uuid AND r.status='PENDING' AND (r.expires_at IS NULL OR r.expires_at>NOW()))`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentorship_requests r WHERE r.project_id=p.id AND r.mentor_user_id=${lecturer.id}::uuid AND r.status IN ('DECLINED','CANCELLED','CANCELED_BY_PROJECT') AND r.responded_at>${cooldownSince})`,
    ];
    if (query.q) {
      conditions.push(Prisma.sql`(p.title ILIKE ${pattern(query.q)} OR p.mentorship_summary ILIKE ${pattern(query.q)} OR p.mentorship_needs ILIKE ${pattern(query.q)} OR EXISTS(SELECT 1 FROM unnest(p.mentorship_research_areas||p.mentorship_expertise||p.mentorship_methodologies) t WHERE t ILIKE ${pattern(query.q)}) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p.mentorship_classification->'nodes','[]'::jsonb)) node WHERE node->>'name' ILIKE ${pattern(query.q)}))`);
    }
    if (query.area) {
      conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM unnest(p.mentorship_research_areas) t WHERE LOWER(t)=LOWER(${query.area})) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p.mentorship_classification->'nodes','[]'::jsonb)) node WHERE node->>'level' IN ('field','subfield','topic') AND (LOWER(node->>'name')=LOWER(${query.area}) OR node->>'id'=${query.area})))`);
    }
    if (query.technology) {
      conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM unnest(p.mentorship_expertise||p.mentorship_methodologies) t WHERE LOWER(t)=LOWER(${query.technology})) OR COALESCE(p.mentorship_classification->'skillIds','[]'::jsonb) ? ${normalizeTechnicalSkill(query.technology)})`);
    }
    const from = Prisma.sql`FROM projects p WHERE ${Prisma.join(conditions, " AND ")}`;
    // Deterministic multi-signal structured relevance ranking BEFORE pagination with anti-stuffing caps (LEAST(..., 3)) and deterministic tie-breaker (p.updated_at DESC, p.id ASC).
    const [count, ids] = await db.$transaction([
      db.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS total ${from}`),
      db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT p.id ${from} ORDER BY
        LEAST(3, (SELECT COUNT(DISTINCT node->>'id') FROM jsonb_array_elements(COALESCE(p.mentorship_classification->'nodes','[]'::jsonb)) node WHERE node->>'level'='topic' AND node->>'id'=ANY(${termsArray(lecturerTopics)}))) DESC,
        LEAST(3, (SELECT COUNT(DISTINCT node->>'id') FROM jsonb_array_elements(COALESCE(p.mentorship_classification->'nodes','[]'::jsonb)) node WHERE node->>'level'='subfield' AND node->>'id'=ANY(${termsArray(lecturerSubfields)}))) DESC,
        LEAST(3, (SELECT COUNT(DISTINCT node->>'id') FROM jsonb_array_elements(COALESCE(p.mentorship_classification->'nodes','[]'::jsonb)) node WHERE node->>'level'='field' AND node->>'id'=ANY(${termsArray(lecturerFields)}))) DESC,
        LEAST(3, (SELECT COUNT(DISTINCT LOWER(st)) FROM unnest(p.mentorship_support_types) st WHERE LOWER(st)=ANY(${termsArray(lecturerSupportTypes)}))) DESC,
        LEAST(3, (SELECT COUNT(DISTINCT LOWER(m)) FROM unnest(p.mentorship_methodologies) m WHERE LOWER(m)=ANY(${termsArray(lecturerMethods)}))) DESC,
        LEAST(3, (SELECT COUNT(DISTINCT sk) FROM jsonb_array_elements_text(COALESCE(p.mentorship_classification->'skillIds','[]'::jsonb)) sk WHERE sk=ANY(${termsArray(lecturerSkills)}))) DESC,
        LEAST(3, ((SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(p.mentorship_expertise||p.mentorship_research_areas) t WHERE LOWER(t)=ANY(${termsArray(wantedTerms)})) + (SELECT COUNT(DISTINCT kw) FROM jsonb_array_elements_text(COALESCE(p.mentorship_classification->'keywordIds','[]'::jsonb)) kw WHERE kw=ANY(${termsArray(lecturerKeywords)})))) DESC,
        p.updated_at DESC, p.id ASC LIMIT ${meta.pageSize} OFFSET ${(meta.page - 1) * meta.pageSize}`),
    ], { isolationLevel: "RepeatableRead" });
    const idList = ids.map(r => r.id);
    if (!idList.length) return { items: [], meta: pageMeta(Number(count[0]?.total ?? 0), query) };
    const [projects, activeRels, pendingReqs, activePlans] = await Promise.all([
      db.project.findMany({ where: { id: { in: idList }, deletedAt: null, mentorshipDiscovery: "SEEKING_MENTOR", status: { notIn: ["ARCHIVED", "COMPLETED"] } } }),
      db.mentorRelationship.findMany({ where: { projectId: { in: idList }, status: "ACTIVE" }, select: { projectId: true, mentorRole: true } }),
      db.mentorshipRequest.findMany({ where: { projectId: { in: idList }, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { projectId: true, mentorRole: true } }),
      db.mentorInvitationPlan.findMany({ where: { projectId: { in: idList }, status: "ACTIVE" }, select: { projectId: true, closedRoles: true } }),
    ]);
    const byId = new Map(projects.map(p => [p.id, p]));
    const teamCounts = await mentorshipTeamCounts(projects);
    const items = ids.flatMap(r => {
      const p = byId.get(r.id);
      if (!p) return [];
      const profileData = parseMentorshipProfile(p.mentorshipProfile);
      const pActive = activeRels.filter(rel => rel.projectId === p.id);
      const pPending = pendingReqs.filter(req => req.projectId === p.id);
      const pClosed = new Set(activePlans.find(pl => pl.projectId === p.id)?.closedRoles ?? []);
      const openNamed: MentorRole[] = [];
      if (pActive.length < mentorshipPolicy.maxActiveMentors) {
        const candidates: readonly ("PRIMARY" | "SECONDARY")[] =
          profileData.recruitingRoles?.length ? profileData.recruitingRoles : ["PRIMARY", "SECONDARY"];
        for (const role of candidates) {
          const taken = pActive.some(rel => rel.mentorRole === role) || pPending.some(req => req.mentorRole === role) || pClosed.has(role);
          if (!taken) openNamed.push(role);
        }
      }
      const availableRoles: MentorRole[] = profileData.recruitingRoles?.length
        ? openNamed
        : (openNamed.length ? [...openNamed, "UNASSIGNED"] : (pActive.length < mentorshipPolicy.maxActiveMentors ? ["UNASSIGNED"] : []));
      const hasProspectivePolicy = Boolean(
        profileData.prospectiveAccess && (!profileData.prospectiveAccess.expiresAt || new Date(profileData.prospectiveAccess.expiresAt) > new Date()),
      );
      return [{
        ...mentorshipPreview(p, teamCounts.get(p.id)),
        availableRoles,
        ...(hasProspectivePolicy ? { hasProspectiveAccessPolicy: true } : {}),
        ...(profileData.expectedDuration ? { expectedDuration: profileData.expectedDuration } : {}),
        ...(profileData.expectedFrequency ? { expectedFrequency: profileData.expectedFrequency } : {}),
        ...(profileData.recruitingRoles?.length ? { recruitingRoles: profileData.recruitingRoles } : {}),
      }];
    });
    return { items, meta: pageMeta(Number(count[0]?.total ?? 0), query) };
  },
};
