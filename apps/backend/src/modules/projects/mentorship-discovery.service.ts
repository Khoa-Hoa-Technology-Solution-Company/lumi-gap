import { Prisma } from "../../generated/prisma/client.js";
import type { AcademicProfile, Project, User } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";
import { pageMeta, mentorshipPreview, type AcademicSearch } from "./project-mentorship.service.js";

const termsArray = (terms: string[]) => terms.length ? Prisma.sql`ARRAY[${Prisma.join(terms.map(s => s.toLowerCase()))}]::text[]` : Prisma.sql`ARRAY[]::text[]`;
const pattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const overlap = (profileTerms: string[], wanted: string[]) => profileTerms.filter(term => wanted.some(w => w.toLocaleLowerCase() === term.toLocaleLowerCase()));

export const mentorshipDiscoveryService = {
  async mentors(project: Project, owner: User, query: AcademicSearch) {
    const db = getPrisma(), meta = pageMeta(0, query), wanted = [...new Set([project.researchField ?? "", ...project.mentorshipExpertise].filter(Boolean))];
    // Only visible fields participate in filtering/matching. Private values cannot become side channels.
    const candidates = Prisma.sql`SELECT u.id, COALESCE(u.legacy_mongo_id,u.id::text) AS public_id, u.full_name, u.avatar_url, u.institution,
      p.position_title,
      CASE WHEN COALESCE(p.privacy_settings->>'expertise','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN p.expertise_areas ELSE ARRAY[]::text[] END AS areas,
      CASE WHEN COALESCE(p.privacy_settings->>'researchInterests','PUBLIC') IN ('PUBLIC','REGISTERED_USERS') THEN u.research_interests ELSE ARRAY[]::text[] END AS interests
      FROM users u JOIN academic_profiles p ON p.user_id=u.id
      WHERE u.is_active AND u.account_status='ACTIVE' AND u.email_verified_at IS NOT NULL
        AND p.academic_role='LECTURER' AND p.role_verification_status='VERIFIED' AND p.position_status='VERIFIED'
        AND p.profile_visibility IN ('PUBLIC','MEMBERS_ONLY') AND p.show_in_researcher_search
        AND p.support_availability->>'enabled'='true' AND u.id<>${owner.id}::uuid
        AND NOT EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=${project.id}::uuid AND pm.user_id=u.id AND pm.status='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM mentor_relationships mr WHERE mr.project_id=${project.id}::uuid AND mr.mentor_user_id=u.id AND mr.status='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM mentorship_requests r WHERE r.project_id=${project.id}::uuid AND r.mentor_user_id=u.id AND r.status='PENDING' AND (r.expires_at IS NULL OR r.expires_at>NOW()))`;
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (query.q) conditions.push(Prisma.sql`(full_name ILIKE ${pattern(query.q)} OR institution ILIKE ${pattern(query.q)} OR position_title ILIKE ${pattern(query.q)} OR EXISTS(SELECT 1 FROM unnest(areas||interests) t WHERE t ILIKE ${pattern(query.q)}))`);
    if (query.institution) conditions.push(Prisma.sql`institution ILIKE ${pattern(query.institution)}`);
    if (query.position) conditions.push(Prisma.sql`position_title ILIKE ${pattern(query.position)}`);
    if (query.area) conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM unnest(areas) t WHERE LOWER(t)=LOWER(${query.area}))`);
    if (query.interest) conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM unnest(interests) t WHERE LOWER(t)=LOWER(${query.interest}))`);
    const filtered = Prisma.sql`WITH visible AS (${candidates}) SELECT * FROM visible WHERE ${Prisma.join(conditions, " AND ")}`;
    type Row = { id: string; public_id: string; full_name: string; avatar_url: string | null; institution: string | null; position_title: string | null; areas: string[]; interests: string[] };
    const [count, rows] = await db.$transaction([
      db.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS total FROM (${filtered}) result`),
      db.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM (${filtered}) result ORDER BY
        (SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(areas||interests) t WHERE LOWER(t)=ANY(${termsArray(wanted)})) DESC,
        CASE WHEN LOWER(institution)=LOWER(${owner.institution ?? ""}) THEN 1 ELSE 0 END DESC,
        LOWER(full_name), id LIMIT ${meta.pageSize} OFFSET ${(meta.page - 1) * meta.pageSize}`),
    ], { isolationLevel: "RepeatableRead" });
    return { items: rows.map(r => ({ _id: r.public_id, fullName: r.full_name, avatarUrl: r.avatar_url ?? undefined, institutionName: r.institution ?? undefined,
      positionTitle: r.position_title ?? undefined, academicRole: "LECTURER", verifiedLecturer: true, acceptingMentorships: true,
      expertiseAreas: r.areas, researchInterests: r.interests, matchedTerms: [...new Set(overlap([...r.areas, ...r.interests], wanted))],
      sameInstitution: Boolean(owner.institution && r.institution?.toLowerCase() === owner.institution.toLowerCase()),
    })), meta: pageMeta(Number(count[0]?.total ?? 0), query) };
  },
  async opportunities(lecturer: User, profile: AcademicProfile, query: AcademicSearch) {
    const db = getPrisma(), meta = pageMeta(0, query), wanted = [...profile.expertiseAreas, ...lecturer.researchInterests];
    const conditions = [Prisma.sql`p.mentorship_discovery='SEEKING_MENTOR' AND p.status NOT IN ('ARCHIVED','COMPLETED') AND p.owner_id<>${lecturer.id}::uuid`,
      Prisma.sql`(SELECT COUNT(*) FROM mentor_relationships mr WHERE mr.project_id=p.id AND mr.status='ACTIVE')<${env.MAX_ACTIVE_MENTORS_PER_PROJECT}`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=${lecturer.id}::uuid AND pm.status='ACTIVE')`,
      Prisma.sql`NOT EXISTS(SELECT 1 FROM mentorship_requests r WHERE r.project_id=p.id AND r.mentor_user_id=${lecturer.id}::uuid AND r.status='PENDING' AND (r.expires_at IS NULL OR r.expires_at>NOW()))`,
    ];
    if (query.q) conditions.push(Prisma.sql`(p.title ILIKE ${pattern(query.q)} OR p.research_field ILIKE ${pattern(query.q)} OR EXISTS(SELECT 1 FROM unnest(p.mentorship_expertise) t WHERE t ILIKE ${pattern(query.q)}))`);
    if (query.area) conditions.push(Prisma.sql`(LOWER(p.research_field)=LOWER(${query.area}) OR EXISTS(SELECT 1 FROM unnest(p.mentorship_expertise) t WHERE LOWER(t)=LOWER(${query.area})))`);
    const from = Prisma.sql`FROM projects p WHERE ${Prisma.join(conditions, " AND ")}`;
    const [count, ids] = await db.$transaction([
      db.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS total ${from}`),
      db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT p.id ${from} ORDER BY
        (SELECT COUNT(DISTINCT LOWER(t)) FROM unnest(p.mentorship_expertise||ARRAY[COALESCE(p.research_field,'')]) t WHERE LOWER(t)=ANY(${termsArray(wanted)})) DESC,
        p.updated_at DESC,p.id LIMIT ${meta.pageSize} OFFSET ${(meta.page - 1) * meta.pageSize}`),
    ], { isolationLevel: "RepeatableRead" });
    const projects = await db.project.findMany({ where: { id: { in: ids.map(r => r.id) }, mentorshipDiscovery: "SEEKING_MENTOR", status: { notIn: ["ARCHIVED", "COMPLETED"] } } });
    const byId = new Map(projects.map(p => [p.id, p]));
    return { items: ids.flatMap(r => { const p = byId.get(r.id); return p ? [mentorshipPreview(p)] : []; }), meta: pageMeta(Number(count[0]?.total ?? 0), query) };
  },
};
