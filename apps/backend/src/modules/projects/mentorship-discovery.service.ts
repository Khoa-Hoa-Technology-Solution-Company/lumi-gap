import { normalizeTechnicalSkill, TECHNICAL_SKILLS } from "@trend/shared-types";
import { readResearchClassification } from "../taxonomy/research-classification.service.js";
import { explainMentorRelevance } from "./mentor-relevance.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { AcademicProfile, Project, User } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";
import { mentorPositions } from "./mentorship-positions.js";
import { pageMeta, mentorshipPreview, mentorshipTeamCounts, type AcademicSearch } from "./project-mentorship.service.js";

const termsArray = (terms: string[]) => terms.length ? Prisma.sql`ARRAY[${Prisma.join(terms.map(s => s.toLowerCase()))}]::text[]` : Prisma.sql`ARRAY[]::text[]`;
const pattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const overlap = (profileTerms: string[], wanted: string[]) => profileTerms.filter(term => wanted.some(w => w.toLocaleLowerCase() === term.toLocaleLowerCase()));

export const mentorshipDiscoveryService = {
  async mentors(project: Project, owner: User, query: AcademicSearch) {
    const configured = [...project.mentorshipResearchAreas, ...project.mentorshipExpertise, ...project.mentorshipMethodologies];
    const db = getPrisma(), meta = pageMeta(0, query), wanted = [...new Set((configured.length ? configured : [project.researchField ?? "", ...project.researchAreas]).map(term => term.trim()).filter(Boolean))];
    const classification = readResearchClassification(project.researchClassification);
    const wantedNodeIds = (level: string) => classification?.nodes.filter(node => node.level === level).map(node => node.id) ?? [];
    const skillKey = Prisma.sql`CASE ${Prisma.join(TECHNICAL_SKILLS.map(skill => Prisma.sql`WHEN LOWER(TRIM(t))=ANY(${termsArray([skill.id, skill.label, ...skill.aliases])}) THEN ${skill.id}`), " ")} ELSE LOWER(TRIM(t)) END`;
    const wantedSkills = [...(classification?.skillIds ?? []), ...wanted.map(normalizeTechnicalSkill)];
    const cooldownSince = new Date(Date.now() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000);
    // Only visible fields participate in filtering/matching. Private values cannot become side channels.
    const candidates = Prisma.sql`SELECT u.id, COALESCE(u.legacy_mongo_id,u.id::text) AS public_id, u.full_name, u.avatar_url, u.institution,
      p.position_title,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.research_classification ELSE '{}'::jsonb END AS classification,
      p.support_availability AS support,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.expertise_areas ELSE ARRAY[]::text[] END AS areas,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.research_specializations ELSE ARRAY[]::text[] END AS specializations,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.skills ELSE ARRAY[]::text[] END AS skills,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.research_keywords ELSE ARRAY[]::text[] END AS keywords,
      CASE WHEN COALESCE(p.privacy_settings->>'researchInterests','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN u.research_interests ELSE ARRAY[]::text[] END AS interests
      FROM users u JOIN academic_profiles p ON p.user_id=u.id
      WHERE u.is_active AND u.account_status='ACTIVE' AND u.email_verified_at IS NOT NULL
        AND p.academic_role='LECTURER' AND p.role_verification_status='VERIFIED' AND p.position_status='VERIFIED'
        AND p.profile_visibility IN ('PUBLIC','MEMBERS_ONLY') AND p.show_in_researcher_search AND p.allow_collaboration_requests
        AND p.support_availability->>'enabled'='true' AND u.id<>${owner.id}::uuid
        AND NOT EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=${project.id}::uuid AND pm.user_id=u.id AND pm.status='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM mentor_relationships mr WHERE mr.project_id=${project.id}::uuid AND mr.mentor_user_id=u.id AND mr.status='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM mentorship_requests r WHERE r.project_id=${project.id}::uuid AND r.mentor_user_id=u.id AND r.status='PENDING' AND (r.expires_at IS NULL OR r.expires_at>NOW()))
        AND NOT EXISTS(SELECT 1 FROM mentorship_requests r WHERE r.project_id=${project.id}::uuid AND r.mentor_user_id=u.id AND r.status IN ('DECLINED','CANCELLED','CANCELED_BY_PROJECT') AND r.responded_at>${cooldownSince})`;
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (query.q) conditions.push(Prisma.sql`(full_name ILIKE ${pattern(query.q)} OR institution ILIKE ${pattern(query.q)} OR position_title ILIKE ${pattern(query.q)} OR EXISTS(SELECT 1 FROM unnest(areas||interests||specializations||skills||keywords) t WHERE t ILIKE ${pattern(query.q)}) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'name' ILIKE ${pattern(query.q)}))`);
    if (query.institution) conditions.push(Prisma.sql`institution ILIKE ${pattern(query.institution)}`);
    if (query.position) conditions.push(Prisma.sql`position_title ILIKE ${pattern(query.position)}`);
    if (query.area) conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM unnest(areas) t WHERE LOWER(t)=LOWER(${query.area})) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'=${"field"} AND (LOWER(node->>'name')=LOWER(${query.area}) OR node->>'id'=${query.area})))`);
    if (query.specialization) conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM unnest(specializations) t WHERE LOWER(t)=LOWER(${query.specialization})) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'=${"subfield"} AND (LOWER(node->>'name')=LOWER(${query.specialization}) OR node->>'id'=${query.specialization})))`);
    if (query.technology) conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM unnest(skills) t WHERE ${skillKey}=${normalizeTechnicalSkill(query.technology)}) OR COALESCE(classification->'skillIds','[]'::jsonb) ? ${normalizeTechnicalSkill(query.technology)})`);
    if (query.interest) conditions.push(Prisma.sql`(EXISTS(SELECT 1 FROM unnest(interests) t WHERE LOWER(t)=LOWER(${query.interest})) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'=${"topic"} AND (LOWER(node->>'name')=LOWER(${query.interest}) OR node->>'id'=${query.interest})))`);
    const filtered = Prisma.sql`WITH visible AS (${candidates}) SELECT * FROM visible WHERE ${Prisma.join(conditions, " AND ")}`;
    type Row = { id: string; public_id: string; full_name: string; avatar_url: string | null; institution: string | null; position_title: string | null; areas: string[]; interests: string[]; specializations: string[]; skills: string[]; keywords: string[]; classification: unknown; support: { types?: string[]; preferredTopics?: string[]; preferredTopicIds?: string[] } };
    const [count, rows] = await db.$transaction([
      db.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS total FROM (${filtered}) result`),
      db.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM (${filtered}) result ORDER BY
        (SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'='topic' AND node->>'id'=ANY(${termsArray(wantedNodeIds("topic"))})) DESC,
        ((SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'='subfield' AND node->>'id'=ANY(${termsArray(wantedNodeIds("subfield"))})) + (SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(specializations) t WHERE LOWER(t)=ANY(${termsArray(wanted)}))) DESC,
        ((SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(classification->'nodes','[]'::jsonb)) node WHERE node->>'level'='field' AND node->>'id'=ANY(${termsArray(wantedNodeIds("field"))})) + (SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(areas) t WHERE LOWER(t)=ANY(${termsArray(wanted)}))) DESC,
        (SELECT COUNT(DISTINCT skill) FROM (SELECT ${skillKey} AS skill FROM unnest(skills) t UNION SELECT jsonb_array_elements_text(COALESCE(classification->'skillIds','[]'::jsonb))) matched WHERE skill=ANY(${termsArray(wantedSkills)})) DESC,
        ((SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(interests||keywords) t WHERE LOWER(t)=ANY(${termsArray(wanted)})) + (SELECT COUNT(*) FROM jsonb_array_elements_text(COALESCE(classification->'keywordIds','[]'::jsonb)) keyword_id WHERE keyword_id=ANY(${termsArray(classification?.keywordIds ?? [])}))) DESC,
        (SELECT COUNT(*) FROM jsonb_array_elements_text(COALESCE(support->'preferredTopicIds','[]'::jsonb)) supervised WHERE supervised=ANY(${termsArray(wantedNodeIds("topic"))})) DESC,
        (SELECT COUNT(*) FROM jsonb_array_elements_text(COALESCE(support->'types','[]'::jsonb)) support_type WHERE LOWER(support_type)=ANY(${termsArray(project.mentorshipSupportTypes.map(type => type.toLowerCase()))})) DESC,
        LOWER(full_name), id LIMIT ${meta.pageSize} OFFSET ${(meta.page - 1) * meta.pageSize}`),
    ], { isolationLevel: "RepeatableRead" });
    return { items: rows.map(r => ({ _id: r.public_id, fullName: r.full_name, avatarUrl: r.avatar_url ?? undefined, institutionName: r.institution ?? undefined,
      positionTitle: r.position_title ?? undefined, academicRole: "LECTURER", verifiedLecturer: true, acceptingMentorships: true,
      expertiseAreas: r.areas, researchInterests: r.interests, researchSpecializations: r.specializations, skills: r.skills, researchKeywords: r.keywords, matchedTerms: [...new Set(overlap([...r.areas, ...r.interests, ...r.specializations, ...r.skills, ...r.keywords], wanted))],
      matchExplanation: explainMentorRelevance({ classification, terms: wanted, supportTypes: project.mentorshipSupportTypes }, { classification: readResearchClassification(r.classification), areas: r.areas, specializations: r.specializations, skills: r.skills, interests: r.interests, keywords: r.keywords, supportTypes: r.support.types, preferredTopics: r.support.preferredTopics, preferredTopicIds: r.support.preferredTopicIds }),
      sameInstitution: Boolean(owner.institution && r.institution?.toLowerCase() === owner.institution.toLowerCase()),
    })), meta: pageMeta(Number(count[0]?.total ?? 0), query) };
  },
  async opportunities(lecturer: User, profile: AcademicProfile, query: AcademicSearch) {
    const db = getPrisma(), meta = pageMeta(0, query), wanted = [...profile.expertiseAreas, ...profile.researchSpecializations, ...profile.skills, ...profile.researchKeywords, ...lecturer.researchInterests];
    const cooldownSince = new Date(Date.now() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000);
    const recruiting = (role: string) => Prisma.sql`NOT EXISTS(SELECT 1 FROM mentor_relationships mr WHERE mr.project_id=p.id AND mr.status='ACTIVE' AND mr.mentor_role=${role}) AND NOT EXISTS(SELECT 1 FROM mentor_invitation_plans plan WHERE plan.project_id=p.id AND plan.status='ACTIVE' AND ${role}=ANY(plan.closed_roles))`;
    const conditions = [Prisma.sql`p.mentorship_discovery='SEEKING_MENTOR' AND p.status NOT IN ('ARCHIVED','COMPLETED') AND p.owner_id<>${lecturer.id}::uuid`,
      Prisma.sql`(${recruiting("PRIMARY")} OR ${recruiting("SECONDARY")})`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentorship_applications app WHERE app.project_id=p.id AND app.lecturer_id=${lecturer.id}::uuid AND app.status IN ('APPLIED','SHORTLISTED','INVITED','ACCEPTED'))`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentor_invitation_plans plan WHERE plan.project_id=p.id AND plan.status='ACTIVE' AND 'PRIMARY'=ANY(plan.closed_roles) AND 'SECONDARY'=ANY(plan.closed_roles))`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=${lecturer.id}::uuid AND pm.status='ACTIVE')`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentor_relationships mr WHERE mr.project_id=p.id AND mr.mentor_user_id=${lecturer.id}::uuid AND mr.status='ACTIVE')`,
      Prisma.sql`EXISTS(SELECT 1 FROM users owner WHERE owner.id=p.owner_id AND owner.is_active AND owner.account_status='ACTIVE' AND owner.email_verified_at IS NOT NULL)`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentorship_requests r WHERE r.project_id=p.id AND r.mentor_user_id=${lecturer.id}::uuid AND r.status='PENDING' AND (r.expires_at IS NULL OR r.expires_at>NOW()))`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentorship_requests r WHERE r.project_id=p.id AND r.mentor_user_id=${lecturer.id}::uuid AND r.status IN ('DECLINED','CANCELLED','CANCELED_BY_PROJECT') AND r.responded_at>${cooldownSince})`,
    ];
    if (query.q) conditions.push(Prisma.sql`(p.title ILIKE ${pattern(query.q)} OR p.mentorship_summary ILIKE ${pattern(query.q)} OR p.mentorship_needs ILIKE ${pattern(query.q)} OR EXISTS(SELECT 1 FROM unnest(p.mentorship_research_areas||p.mentorship_expertise) t WHERE t ILIKE ${pattern(query.q)}))`);
    if (query.area) conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM unnest(p.mentorship_research_areas) t WHERE LOWER(t)=LOWER(${query.area}))`);
    const from = Prisma.sql`FROM projects p WHERE ${Prisma.join(conditions, " AND ")}`;
    const [count, ids] = await db.$transaction([
      db.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS total ${from}`),
      db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT p.id ${from} ORDER BY
        (SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(p.mentorship_expertise||p.mentorship_research_areas) t WHERE LOWER(t)=ANY(${termsArray(wanted)})) DESC,
        p.updated_at DESC,p.id LIMIT ${meta.pageSize} OFFSET ${(meta.page - 1) * meta.pageSize}`),
    ], { isolationLevel: "RepeatableRead" });
    const projects = await db.project.findMany({ where: { id: { in: ids.map(r => r.id) }, mentorshipDiscovery: "SEEKING_MENTOR", status: { notIn: ["ARCHIVED", "COMPLETED"] } } });
    const byId = new Map(projects.map(p => [p.id, p]));
    const teamCounts = await mentorshipTeamCounts(projects);
    const items = await Promise.all(ids.flatMap(r => { const p = byId.get(r.id); return p ? [p] : []; }).map(async p => {
      const positions = await mentorPositions(p.id);
      const plan = await db.mentorInvitationPlan.findFirst({ where: { projectId: p.id, status: "ACTIVE" } });
      return { ...mentorshipPreview(p, teamCounts.get(p.id)), availableRoles: (["PRIMARY", "SECONDARY"] as const).filter(role => positions[role].status !== "ASSIGNED" && !plan?.closedRoles.includes(role)) };
    }));
    return { items, meta: pageMeta(Number(count[0]?.total ?? 0), query) };
  },
};
