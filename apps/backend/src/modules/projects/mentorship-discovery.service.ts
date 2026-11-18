import { Prisma } from "../../generated/prisma/client.js";
import type { AcademicProfile, Project, User } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";
import { mentorshipPolicy } from "./mentorship-positions.js";
import { pageMeta, mentorshipPreview, mentorshipTeamCounts, type AcademicSearch } from "./project-mentorship.service.js";

const termsArray = (terms: string[]) => terms.length ? Prisma.sql`ARRAY[${Prisma.join(terms.map(s => s.toLowerCase()))}]::text[]` : Prisma.sql`ARRAY[]::text[]`;
const pattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const overlap = (profileTerms: string[], wanted: string[]) => profileTerms.filter(term => wanted.some(w => w.toLocaleLowerCase() === term.toLocaleLowerCase()));

export const mentorshipDiscoveryService = {
  async mentors(project: Project | null, owner: User, query: AcademicSearch) {
    const configured = project ? [...project.mentorshipResearchAreas, ...project.mentorshipExpertise] : [];
    const db = getPrisma(), meta = pageMeta(0, query);
    const plan = project ? await db.researchPlan.findUnique({ where: { projectId: project.id }, select: { searchStrategy: true } }) : null;
    const wanted = [...new Set((configured.length ? configured : [project?.researchField ?? query.area ?? "", ...(project?.researchAreas ?? []), ...(plan?.searchStrategy?.split(/[,;\n]/) ?? [])]).map(term => term.trim()).filter(term => term.length > 0 && term.length <= 120))];
    const cooldownSince = new Date(Date.now() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000);
    const exactEmail = query.q && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.q.trim()) ? query.q.trim().toLowerCase() : null;
    const projectExclusions = project ? Prisma.sql`
        AND NOT EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=${project.id}::uuid AND pm.user_id=u.id AND pm.status='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM mentorship_requests r WHERE r.project_id=${project.id}::uuid AND r.mentor_user_id=u.id AND r.status IN ('DECLINED','CANCELLED','CANCELED_BY_PROJECT') AND r.responded_at>${cooldownSince})` : Prisma.sql``;
    const emailFilter = exactEmail ? Prisma.sql`AND (LOWER(u.email)=${exactEmail} OR EXISTS(SELECT 1 FROM user_emails ue WHERE ue.user_id=u.id AND ue.normalized_email=${exactEmail} AND ue.verified_at IS NOT NULL))` : Prisma.sql``;
    // Only visible fields participate in filtering/matching (plus exact verified email lookup without exposing emails in results).
    const candidates = Prisma.sql`SELECT u.id, COALESCE(u.legacy_mongo_id,u.id::text) AS public_id, u.full_name, u.avatar_url, u.institution,
      p.position_title,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.research_keywords || p.skills || ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.support_availability->'preferredTopics')='array' THEN p.support_availability->'preferredTopics' ELSE '[]'::jsonb END)) ELSE ARRAY[]::text[] END AS keywords,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.expertise_areas ELSE ARRAY[]::text[] END AS areas,
      CASE WHEN COALESCE(p.privacy_settings->>'researchInterests','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN u.research_interests ELSE ARRAY[]::text[] END AS interests
      FROM users u JOIN academic_profiles p ON p.user_id=u.id
      WHERE u.is_active AND u.account_status='ACTIVE' AND u.email_verified_at IS NOT NULL
        AND p.academic_role='LECTURER' AND p.role_verification_status='VERIFIED' AND p.position_status='VERIFIED'
        AND p.profile_visibility IN ('PUBLIC','MEMBERS_ONLY') AND p.show_in_researcher_search
        AND p.support_availability->>'enabled'='true' AND u.id<>${owner.id}::uuid
        ${emailFilter}
        ${projectExclusions}`;
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (query.q && !exactEmail) conditions.push(Prisma.sql`(full_name ILIKE ${pattern(query.q)} OR institution ILIKE ${pattern(query.q)} OR position_title ILIKE ${pattern(query.q)} OR EXISTS(SELECT 1 FROM unnest(areas||interests||keywords) t WHERE t ILIKE ${pattern(query.q)}))`);
    if (query.institution) conditions.push(Prisma.sql`institution ILIKE ${pattern(query.institution)}`);
    if (query.position) conditions.push(Prisma.sql`position_title ILIKE ${pattern(query.position)}`);
    if (query.area) conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM unnest(areas) t WHERE LOWER(t)=LOWER(${query.area}))`);
    if (query.interest) conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM unnest(interests) t WHERE LOWER(t)=LOWER(${query.interest}))`);
    const filtered = Prisma.sql`WITH visible AS (${candidates}) SELECT * FROM visible WHERE ${Prisma.join(conditions, " AND ")}`;
    type Row = { id: string; public_id: string; full_name: string; avatar_url: string | null; institution: string | null; position_title: string | null; areas: string[]; interests: string[]; keywords: string[] };
    const [count, rows] = await db.$transaction([
      db.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS total FROM (${filtered}) result`),
      db.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM (${filtered}) result ORDER BY
        (SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(areas||interests||keywords) t WHERE LOWER(t)=ANY(${termsArray(wanted)})) DESC,
        CASE WHEN LOWER(institution)=LOWER(${owner.institution ?? ""}) THEN 1 ELSE 0 END DESC,
        LOWER(full_name), id LIMIT ${meta.pageSize} OFFSET ${(meta.page - 1) * meta.pageSize}`),
    ], { isolationLevel: "RepeatableRead" });
    const [pending, active] = project ? await Promise.all([
      db.mentorshipRequest.findMany({ where: { projectId: project.id, mentorUserId: { in: rows.map(r => r.id) }, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { mentorUserId: true } }),
      db.mentorRelationship.findMany({ where: { projectId: project.id, mentorUserId: { in: rows.map(r => r.id) }, status: "ACTIVE" }, select: { mentorUserId: true } }),
    ]) : [[], []];
    return { items: rows.map(r => ({ _id: r.public_id, fullName: r.full_name, avatarUrl: r.avatar_url ?? undefined, institutionName: r.institution ?? undefined,
      positionTitle: r.position_title ?? undefined, academicRole: "LECTURER", verifiedLecturer: true, acceptingMentorships: true,
      isDemo: /(?:\(demo\)|\bdemo\b)/i.test(`${r.full_name} ${r.institution ?? ""}`),
      ...(active.some(a => a.mentorUserId === r.id) ? { mentorshipStatus: "ACTIVE" as const } : pending.some(p => p.mentorUserId === r.id) ? { mentorshipStatus: "PENDING" as const } : {}),
      expertiseAreas: r.areas, researchInterests: r.interests, matchedTerms: [...new Set(overlap([...r.areas, ...r.interests, ...r.keywords], wanted))],
      sameInstitution: Boolean(owner.institution && r.institution?.toLowerCase() === owner.institution.toLowerCase()),
    })), meta: pageMeta(Number(count[0]?.total ?? 0), query) };
  },
  async opportunities(lecturer: User, profile: AcademicProfile, query: AcademicSearch) {
    const db = getPrisma(), meta = pageMeta(0, query), wanted = [...profile.expertiseAreas, ...lecturer.researchInterests];
    const cooldownSince = new Date(Date.now() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000);
    const conditions = [Prisma.sql`p.deleted_at IS NULL AND p.mentorship_discovery='SEEKING_MENTOR' AND p.status NOT IN ('ARCHIVED','COMPLETED') AND p.owner_id<>${lecturer.id}::uuid`,
      Prisma.sql`(SELECT COUNT(*) FROM mentor_relationships m WHERE m.project_id=p.id AND m.status='ACTIVE')<${mentorshipPolicy.maxActiveMentors}`,
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
    const projects = await db.project.findMany({ where: { id: { in: ids.map(r => r.id) }, deletedAt: null, mentorshipDiscovery: "SEEKING_MENTOR", status: { notIn: ["ARCHIVED", "COMPLETED"] } } });
    const byId = new Map(projects.map(p => [p.id, p]));
    const teamCounts = await mentorshipTeamCounts(projects);
    const items = ids.flatMap(r => { const p = byId.get(r.id); return p ? [{ ...mentorshipPreview(p, teamCounts.get(p.id)), availableRoles: ["UNASSIGNED" as const] }] : []; });
    return { items, meta: pageMeta(Number(count[0]?.total ?? 0), query) };
  },
};
