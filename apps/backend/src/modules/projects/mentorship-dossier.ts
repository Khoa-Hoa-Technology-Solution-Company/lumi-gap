import {
  mentorDefaultPermissions,
  type DossierAccessSummary,
  type DossierCompetencies,
  type DossierCompetencyItem,
  type DossierExpectations,
  type DossierFeaturedWork,
  type DossierProvenance,
  type DossierPublicLink,
  type DossierStudentProfile,
  type DossierTeamMemberSummary,
  type InvitationDossier,
  type InvitationDossierInput,
  type MentorAccessPolicy,
  type MentorPermission,
  type MentorPolicyInput,
  type MentorRole,
  type ProjectStatus,
} from "@trend/shared-types";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { MentorInvitationContext } from "@trend/shared-types";
import { hasMeaningfulResearchText } from "@trend/shared-types";
import { validateMentorPermissions } from "./mentor-access.service.js";
import type { WorkspaceDb } from "./workspace-access.js";

const trimmedString = (max: number) => z.string().trim().max(max);
const stringArray = (maxItems: number, maxLen: number) => z.array(trimmedString(maxLen).min(1)).max(maxItems);

export const dossierExpectationsSchema = z.object({
  supportAreas: stringArray(10, 80).default([]),
  expectedPeriod: trimmedString(120).optional(),
  meetingFrequency: trimmedString(120).optional(),
  expectedMilestone: trimmedString(200).optional(),
  preferredChannel: trimmedString(120).optional(),
  proposedNote: trimmedString(500).optional(),
}).strict();

export const invitationDossierInputSchema = z.object({
  presentation: z.literal("BRIEF").optional(),
  researchField: trimmedString(120).optional(),
  researchSummary: trimmedString(2000).optional(),
  additionalMessage: trimmedString(1000).optional(),
  sharingConfirmed: z.boolean().optional(),
  approvedObjective: trimmedString(500).optional(),
  keywords: stringArray(12, 50).optional(),
  shareRepresentativeProfile: z.boolean().optional(),
  shareRepresentativeLinks: z.boolean().optional(),
  shareRepresentativeWorks: z.boolean().optional(),
  shareTeamOverview: z.boolean().optional(),
  shareCompetencies: z.boolean().optional(),
  teamOverviewNote: trimmedString(400).optional(),
  researchMethods: stringArray(12, 80).optional(),
  researchTools: stringArray(12, 80).optional(),
  expectations: dossierExpectationsSchema.optional(),
}).strict();

/** New outbound invitations require an intentionally approved, useful research brief. */
export const officialInvitationDossierSchema = invitationDossierInputSchema.extend({
  researchSummary: z.string().trim().max(2000).refine(hasMeaningfulResearchText, "Describe the research question or direction; avoid empty text and placeholders"),
  sharingConfirmed: z.literal(true),
  expectations: dossierExpectationsSchema.extend({ supportAreas: z.array(z.enum(["RESEARCH_DIRECTION", "LITERATURE_REVIEW", "RESEARCH_METHODOLOGY", "ACADEMIC_WRITING", "RESEARCH_GAP_VALIDATION", "EXPERIMENT_DESIGN", "DATA_ANALYSIS", "SOFTWARE_TECHNICAL_GUIDANCE"])).max(8).refine(items => new Set(items).size === items.length).default([]) }).optional(),
}).strict().superRefine((input, context) => {
  if (input.presentation !== "BRIEF") return;
  const allowed = new Set(["presentation", "researchSummary", "sharingConfirmed", "expectations"]);
  if (Object.keys(input).some(key => !allowed.has(key)) || input.expectations && Object.keys(input.expectations).some(key => key !== "supportAreas")) {
    context.addIssue({ code: "custom", message: "A short invitation shares only the displayed introduction and optional support areas" });
  }
});

const INTEGRITY_NOTICE =
  "Các kỹ năng, phương pháp, công cụ và kinh nghiệm do thành viên tự khai báo trừ khi được gắn nhãn xác minh đơn vị hoặc công bố công khai. Hệ thống không chấm điểm hay xếp hạng chất lượng nhóm.";

const BEFORE_ACCEPT_NOTICE =
  "Trước khi chấp nhận, Thầy/Cô chỉ xem được Hồ sơ mời hướng dẫn và tệp đính kèm của lời mời; không truy cập bản thảo, kế hoạch, dữ liệu hay trao đổi nội bộ của dự án.";

const AFTER_ACCEPT_NOTICE =
  "Nếu Thầy/Cô chấp nhận với vai trò đề xuất, quyền truy cập và tài nguyên đã chọn sẽ được kích hoạt (cả hai bên có thể điều chỉnh hoặc kết thúc bất kỳ lúc nào).";

function cleanList(items: readonly (string | null | undefined)[] | undefined, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items ?? []) {
    const trimmed = typeof item === "string" ? item.trim() : "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

function fieldPrivate(privacy: Record<string, unknown> | null | undefined, keys: string[], viewerIsSelf: boolean): boolean {
  if (viewerIsSelf || !privacy || typeof privacy !== "object") return false;
  return keys.some(k => privacy[k] === "PRIVATE");
}

function formatYearLabel(cohort?: string | null, startYear?: number | null): string | undefined {
  const cleanedCohort = cohort?.trim();
  if (cleanedCohort) return cleanedCohort;
  if (typeof startYear === "number" && startYear >= 1980 && startYear <= 2100) return `Khóa ${startYear}`;
  return undefined;
}

function truncateText(text: string | null | undefined, max = 320): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

interface ProfileBundle {
  user: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    institution: string | null;
    researchInterests: string[];
  };
  profile: {
    id: string;
    userId: string;
    academicRole: string | null;
    positionTitle: string | null;
    headline: string | null;
    biography: string | null;
    affiliationStartYear: number | null;
    researchKeywords: string[];
    skills: string[];
    expertiseAreas: string[];
    profileVisibility: string;
    privacySettings: unknown;
    roleVerificationStatus: string;
    positionStatus: string;
  } | null;
  affiliation: {
    institutionName: string;
    department: string | null;
    positionTitle: string | null;
    cohort: string | null;
    programId: string | null;
    verificationStatus: string;
  } | null;
  programName?: string;
  links: Array<{
    provider: string;
    label: string | null;
    profileUrl: string | null;
    verificationStatus: string;
    visibility: string;
  }>;
  works: Array<{
    id: string;
    kind: string;
    title: string | null;
    year: number | null;
    doi: string | null;
    source: string;
  }>;
}

async function loadProfileBundles(db: WorkspaceDb, userIds: string[]): Promise<Map<string, ProfileBundle>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const [users, profiles, affiliations, links] = await Promise.all([
    db.user.findMany({
      where: { id: { in: uniqueIds }, isActive: true },
      select: { id: true, fullName: true, avatarUrl: true, institution: true, researchInterests: true },
    }),
    db.academicProfile.findMany({
      where: { userId: { in: uniqueIds } },
      select: {
        id: true,
        userId: true,
        academicRole: true,
        positionTitle: true,
        headline: true,
        biography: true,
        affiliationStartYear: true,
        researchKeywords: true,
        skills: true,
        expertiseAreas: true,
        profileVisibility: true,
        privacySettings: true,
        roleVerificationStatus: true,
        positionStatus: true,
      },
    }),
    db.affiliation.findMany({
      where: { userId: { in: uniqueIds }, isCurrent: true },
      orderBy: [{ isPrimary: "desc" }, { verificationStatus: "asc" }, { createdAt: "desc" }],
      select: {
        userId: true,
        institutionName: true,
        department: true,
        positionTitle: true,
        cohort: true,
        programId: true,
        verificationStatus: true,
      },
    }),
    db.academicIdentityLink.findMany({
      where: { userId: { in: uniqueIds }, visibility: { not: "PRIVATE" } },
      select: { userId: true, provider: true, label: true, profileUrl: true, verificationStatus: true, visibility: true },
    }),
  ]);

  const profileIds = profiles.map(p => p.id);
  const programIds = [...new Set(affiliations.map(a => a.programId).filter((v): v is string => Boolean(v)))];

  const [works, programs] = await Promise.all([
    profileIds.length
      ? db.academicFeaturedWork.findMany({
          where: { profileId: { in: profileIds } },
          orderBy: { position: "asc" },
          select: { id: true, profileId: true, kind: true, title: true, year: true, doi: true, source: true },
        })
      : Promise.resolve([]),
    programIds.length
      ? db.academicProgram.findMany({
          where: { id: { in: programIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const programMap = new Map(programs.map(p => [p.id, p.name]));
  const profileMap = new Map(profiles.map(p => [p.userId, p]));
  const affiliationMap = new Map<string, (typeof affiliations)[number]>();
  for (const a of affiliations) if (!affiliationMap.has(a.userId)) affiliationMap.set(a.userId, a);
  const linksMap = new Map<string, typeof links>();
  for (const l of links) {
    const bucket = linksMap.get(l.userId) ?? [];
    bucket.push(l);
    linksMap.set(l.userId, bucket);
  }
  const worksMap = new Map<string, typeof works>();
  for (const w of works) {
    const bucket = worksMap.get(w.profileId) ?? [];
    bucket.push(w);
    worksMap.set(w.profileId, bucket);
  }

  const result = new Map<string, ProfileBundle>();
  for (const user of users) {
    const profile = profileMap.get(user.id) ?? null;
    const affiliation = affiliationMap.get(user.id) ?? null;
    result.set(user.id, {
      user,
      profile,
      affiliation,
      programName: affiliation?.programId ? programMap.get(affiliation.programId) : undefined,
      links: linksMap.get(user.id) ?? [],
      works: profile ? (worksMap.get(profile.id) ?? []) : [],
    });
  }
  return result;
}

function projectStudentProfile(
  bundle: ProfileBundle | undefined,
  viewerId: string,
  options: { shareProfile?: boolean; shareLinks?: boolean; shareWorks?: boolean } = {},
): DossierStudentProfile | null {
  if (!bundle) return null;
  const { user, profile, affiliation, programName, links, works } = bundle;
  const viewerIsSelf = user.id === viewerId;
  const isPrivateProfile = !viewerIsSelf && profile?.profileVisibility === "PRIVATE";
  const allowFullProfile = options.shareProfile !== false && !isPrivateProfile;
  const privacy = (profile?.privacySettings && typeof profile.privacySettings === "object"
    ? (profile.privacySettings as Record<string, unknown>)
    : null);

  if (!allowFullProfile) {
    return {
      _id: user.id,
      fullName: user.fullName || "Đại diện nhóm nghiên cứu",
      academicRole: profile?.academicRole ?? undefined,
      researchInterests: [],
      skills: [],
      expertiseAreas: [],
      featuredWorks: [],
      publicLinks: [],
      affiliationVerified: false,
      verifiedLecturer: profile?.academicRole === "LECTURER" && profile?.roleVerificationStatus === "VERIFIED",
      provenance: [],
      redacted: isPrivateProfile || options.shareProfile === false,
    };
  }

  const hideAffiliation = fieldPrivate(privacy, ["affiliation", "institution"], viewerIsSelf);
  const hideBio = fieldPrivate(privacy, ["biography", "headline"], viewerIsSelf);
  const hideInterests = fieldPrivate(privacy, ["researchInterests", "interests"], viewerIsSelf);
  const hideSkills = fieldPrivate(privacy, ["skills"], viewerIsSelf);
  const hideExpertise = fieldPrivate(privacy, ["expertise", "expertiseAreas"], viewerIsSelf);
  const hideWorks = fieldPrivate(privacy, ["featuredWorks", "works"], viewerIsSelf) || options.shareWorks === false;
  const hideLinks = fieldPrivate(privacy, ["links", "identities", "externalIdentities"], viewerIsSelf) || options.shareLinks === false;

  const affiliationVerified = !hideAffiliation && Boolean(
    affiliation?.verificationStatus === "VERIFIED" || profile?.positionStatus === "VERIFIED",
  );

  const publicLinks: DossierPublicLink[] = hideLinks
    ? []
    : links
        .filter(l => typeof l.profileUrl === "string" && /^https?:\/\//i.test(l.profileUrl))
        .slice(0, 5)
        .map(l => ({
          provider: l.provider,
          label: l.label ?? undefined,
          profileUrl: l.profileUrl!,
          verified: l.verificationStatus === "PROVIDER_CONNECTED",
        }));

  const featuredWorks: DossierFeaturedWork[] = hideWorks
    ? []
    : works
        .filter(w => Boolean(w.title?.trim()))
        .slice(0, 5)
        .map(w => ({
          id: w.id,
          kind: w.kind,
          title: w.title!.trim(),
          year: w.year ?? undefined,
          doi: w.doi ?? undefined,
          provenance: w.doi || w.source === "CROSSREF" || w.source === "ORCID" ? "PUBLIC_WORK" : "SELF_DECLARED",
        }));

  const researchInterests = hideInterests
    ? []
    : cleanList([...(user.researchInterests ?? []), ...(profile?.researchKeywords ?? [])], 10);
  const skills = hideSkills ? [] : cleanList(profile?.skills, 12);
  const expertiseAreas = hideExpertise ? [] : cleanList(profile?.expertiseAreas, 10);

  const provenanceSet = new Set<DossierProvenance>();
  if (affiliationVerified) provenanceSet.add("VERIFIED_AFFILIATION");
  if (publicLinks.some(l => l.verified)) provenanceSet.add("VERIFIED_IDENTITY");
  if (featuredWorks.some(w => w.provenance === "PUBLIC_WORK")) provenanceSet.add("PUBLIC_WORK");
  if (skills.length || expertiseAreas.length || researchInterests.length || profile?.headline || profile?.biography) {
    provenanceSet.add("SELF_DECLARED");
  }

  return {
    _id: user.id,
    fullName: user.fullName || "Thành viên nhóm",
    avatarUrl: user.avatarUrl ?? undefined,
    academicRole: profile?.academicRole ?? undefined,
    institutionName: hideAffiliation ? undefined : (affiliation?.institutionName || user.institution || undefined),
    department: hideAffiliation ? undefined : (affiliation?.department ?? undefined),
    programName: hideAffiliation ? undefined : programName,
    academicYearLabel: hideAffiliation ? undefined : formatYearLabel(affiliation?.cohort, profile?.affiliationStartYear),
    positionTitle: hideAffiliation ? undefined : (affiliation?.positionTitle || profile?.positionTitle || undefined),
    headline: hideBio ? undefined : truncateText(profile?.headline, 160),
    shortBio: hideBio ? undefined : truncateText(profile?.biography, 320),
    researchInterests,
    skills,
    expertiseAreas,
    featuredWorks,
    publicLinks,
    affiliationVerified,
    verifiedLecturer: profile?.academicRole === "LECTURER" && profile?.roleVerificationStatus === "VERIFIED",
    provenance: [...provenanceSet],
  };
}

function projectTeamMemberSummary(
  bundle: ProfileBundle,
  projectRole: "OWNER" | "MEMBER",
  viewerId: string,
): DossierTeamMemberSummary | null {
  const viewerIsSelf = bundle.user.id === viewerId;
  // Require an explicit non-PRIVATE profile (or self) before surfacing a teammate in a team overview.
  if (!viewerIsSelf && (!bundle.profile || bundle.profile.profileVisibility === "PRIVATE")) return null;
  const projected = projectStudentProfile(bundle, viewerId, { shareProfile: true, shareLinks: false, shareWorks: false });
  if (!projected || projected.redacted) return null;
  return {
    _id: projected._id,
    fullName: projected.fullName,
    avatarUrl: projected.avatarUrl,
    projectRole,
    academicRole: projected.academicRole,
    institutionName: projected.institutionName,
    programName: projected.programName,
    academicYearLabel: projected.academicYearLabel,
    skills: projected.skills.slice(0, 6),
    researchInterests: projected.researchInterests.slice(0, 5),
    affiliationVerified: projected.affiliationVerified,
    provenance: projected.affiliationVerified ? "VERIFIED_AFFILIATION" : "SELF_DECLARED",
  };
}

function buildCompetencies(
  representative: DossierStudentProfile | null,
  sharedMembers: DossierTeamMemberSummary[],
  input: InvitationDossierInput | undefined,
): DossierCompetencies {
  if (input?.shareCompetencies === false) {
    return {
      researchMethods: [],
      technicalSkills: [],
      researchTools: [],
      experienceHighlights: [],
      teamStrengthsNote: undefined,
      integrityNotice: INTEGRITY_NOTICE,
    };
  }

  const methods = cleanList(input?.researchMethods, 10).map<DossierCompetencyItem>(name => ({
    name,
    category: "METHOD",
    provenance: "SELF_DECLARED",
  }));
  const tools = cleanList(input?.researchTools, 10).map<DossierCompetencyItem>(name => ({
    name,
    category: "TOOL",
    provenance: "SELF_DECLARED",
  }));
  const skillPool = cleanList([
    ...(representative && !representative.redacted ? [...representative.skills, ...representative.expertiseAreas] : []),
    ...sharedMembers.flatMap(m => m.skills),
  ], 16);
  const technicalSkills = skillPool.map<DossierCompetencyItem>(name => ({
    name,
    category: "SKILL",
    provenance: "SELF_DECLARED",
  }));
  const experienceHighlights = representative && !representative.redacted && input?.shareRepresentativeWorks !== false
    ? representative.featuredWorks.slice(0, 5)
    : [];

  return {
    researchMethods: methods,
    technicalSkills,
    researchTools: tools,
    experienceHighlights,
    teamStrengthsNote: truncateText(input?.teamOverviewNote, 400),
    integrityNotice: INTEGRITY_NOTICE,
  };
}

function buildAccessSummary(
  mentorRole: MentorRole,
  inputAccess?: MentorPolicyInput,
  livePolicy?: MentorAccessPolicy,
  expiresAtIso?: string | null,
  shareTitles?: string[],
): DossierAccessSummary {
  const preset = livePolicy?.preset ?? inputAccess?.preset ?? "ADVISOR";
  const permissions: MentorPermission[] = livePolicy?.permissions
    ?? inputAccess?.permissions
    ?? [...mentorDefaultPermissions];
  if (!livePolicy && inputAccess?.permissions) validateMentorPermissions(inputAccess.permissions);

  const effectiveExpiresAt = livePolicy?.expiresAt ?? inputAccess?.expiresAt ?? null;
  const shares = shareTitles?.length
    ? shareTitles
    : (inputAccess?.shares ?? []).map(s => s.title?.trim() || `${s.kind} được chọn chia sẻ`);

  return {
    mentorRole,
    preset,
    permissionCount: permissions.length,
    permissions,
    sharedResourceSummary: shares.length
      ? shares.slice(0, 8)
      : ["Chưa mở khóa tài nguyên nội bộ trước khi chấp nhận; các quyền và tài nguyên đã chọn chỉ kích hoạt sau khi Thầy/Cô đồng ý."],
    expiresAt: effectiveExpiresAt,
    responseDeadline: expiresAtIso ?? "Không tự động hết hạn; nhóm có thể thu hồi lời mời",
    beforeAcceptNotice: BEFORE_ACCEPT_NOTICE,
    afterAcceptNotice: AFTER_ACCEPT_NOTICE,
  };
}

async function loadTeamBundles(db: WorkspaceDb, projectId: string, representativeUserId: string) {
  const members = await db.projectMember.findMany({
    where: { projectId, status: "ACTIVE" },
    select: { userId: true, role: true },
  });
  const teamIds = [...new Set([representativeUserId, ...members.map(m => m.userId)])];
  const bundles = await loadProfileBundles(db, teamIds);
  const roleMap = new Map<string, "OWNER" | "MEMBER">();
  for (const m of members) {
    if (m.userId === representativeUserId) continue;
    const role = m.role === "OWNER" ? "OWNER" : "MEMBER";
    roleMap.set(m.userId, role);
  }
  return { members, bundles, roleMap, teamMemberCount: teamIds.length };
}

export interface DossierProjectSource {
  id: string;
  title: string;
  ownerId: string;
  status: string;
  researchField: string | null;
  researchAreas: string[];
  mentorshipSummary: string | null;
  publicSummary: string | null;
  mentorshipExpertise: string[];
  mentorshipResearchAreas: string[];
  mentorshipNeeds: string | null;
}

export async function buildMentorInvitationContext(db: WorkspaceDb, project: DossierProjectSource, senderId: string): Promise<MentorInvitationContext> {
  const [sender, members] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: senderId }, select: { fullName: true } }),
    db.projectMember.count({ where: { projectId: project.id, status: "ACTIVE", userId: { not: project.ownerId } } }),
  ]);
  const fields = { title: project.title, researchField: project.researchField || undefined, researchAreas: cleanList(project.researchAreas), senderDisplayName: sender.fullName, memberCount: members + 1 };
  return { ...fields, token: createHash("sha256").update(JSON.stringify(fields)).digest("hex") };
}

function briefDossier(project: DossierProjectSource, context: MentorInvitationContext, input: InvitationDossierInput, message: string, mentorRole: MentorRole, access?: MentorPolicyInput): InvitationDossier {
  return {
    version: 1, presentation: "BRIEF", senderDisplayName: context.senderDisplayName, generatedAt: new Date().toISOString(),
    project: { id: project.id, title: context.title, abstract: input.researchSummary!.trim(), abstractApproved: true, researchField: context.researchField, researchAreas: context.researchAreas, keywords: [], stage: project.status as ProjectStatus, teamMemberCount: context.memberCount },
    team: { teamMemberCount: context.memberCount, representative: null, sharedMembersCount: 0, sharedMembers: [], privacyRedactedCount: Math.max(0, context.memberCount - 1) },
    competencies: buildCompetencies(null, [], { shareCompetencies: false }),
    whyThisLecturer: { message: message.trim() }, expectations: { supportAreas: cleanList(input.expectations?.supportAreas) },
    accessPreview: buildAccessSummary(mentorRole, access),
  };
}

export async function buildDossierDefaults(db: WorkspaceDb, project: DossierProjectSource, viewerId: string) {
  const { bundles, roleMap, teamMemberCount } = await loadTeamBundles(db, project.id, project.ownerId);
  const representative = projectStudentProfile(bundles.get(project.ownerId), viewerId);
  let shareableMemberCount = 0;
  for (const [userId, role] of roleMap) {
    const b = bundles.get(userId);
    if (b && projectTeamMemberSummary(b, role, viewerId)) shareableMemberCount += 1;
  }
  const competencies = buildCompetencies(representative, [], undefined);
  const keywords = cleanList([
    ...(project.mentorshipResearchAreas ?? []),
    ...(project.mentorshipExpertise ?? []),
    ...(project.researchAreas ?? []),
  ], 10);
  return {
    representative,
    shareableMemberCount,
    keywords,
    competencies,
    defaultExpectations: {
      supportAreas: [] as string[],
      proposedNote: project.mentorshipNeeds?.trim() || undefined,
    } satisfies DossierExpectations,
    teamMemberCount,
  };
}

export async function buildInvitationDossier(
  db: WorkspaceDb,
  params: {
    project: DossierProjectSource;
    representativeUserId: string;
    mentorUserId: string;
    viewerId: string;
    message: string;
    mentorRole?: MentorRole;
    access?: MentorPolicyInput;
    dossier?: InvitationDossierInput;
    expiresAt?: string;
  },
): Promise<InvitationDossier> {
  const { project, representativeUserId, mentorUserId, viewerId, message, mentorRole = "UNASSIGNED", access, dossier } = params;
  if (dossier?.presentation === "BRIEF") return briefDossier(project, await buildMentorInvitationContext(db, project, representativeUserId), dossier, message, mentorRole, access);
  const { bundles, roleMap, teamMemberCount } = await loadTeamBundles(db, project.id, representativeUserId);
  const mentorBundles = await loadProfileBundles(db, [mentorUserId]);
  const mentorBundle = mentorBundles.get(mentorUserId);

  const representative = projectStudentProfile(bundles.get(representativeUserId), viewerId, {
    shareProfile: dossier?.shareRepresentativeProfile,
    shareLinks: dossier?.shareRepresentativeLinks,
    shareWorks: dossier?.shareRepresentativeWorks,
  });

  const sharedMembers: DossierTeamMemberSummary[] = [];
  let privacyRedactedCount = 0;
  if (dossier?.shareTeamOverview) {
    for (const [userId, role] of roleMap) {
      const b = bundles.get(userId);
      const summary = b ? projectTeamMemberSummary(b, role, viewerId) : null;
      if (summary) {
        if (sharedMembers.length < 6) sharedMembers.push(summary);
      } else {
        privacyRedactedCount += 1;
      }
    }
  } else {
    privacyRedactedCount = Math.max(0, teamMemberCount - 1);
  }

  const approvedAbstract = (dossier?.researchSummary ?? project.mentorshipSummary ?? project.publicSummary ?? "").trim();
  const researchAreas = cleanList([
    ...(project.mentorshipResearchAreas ?? []),
    ...(project.mentorshipExpertise ?? []),
  ], 10);
  const keywords = cleanList(
    dossier?.keywords?.length ? dossier.keywords : [...researchAreas, ...(project.mentorshipExpertise ?? [])],
    12,
  );

  const competencies = buildCompetencies(representative, sharedMembers, dossier);
  const expectations: DossierExpectations = {
    supportAreas: cleanList(dossier?.expectations?.supportAreas, 10),
    expectedPeriod: dossier?.expectations?.expectedPeriod?.trim() || undefined,
    meetingFrequency: dossier?.expectations?.meetingFrequency?.trim() || undefined,
    expectedMilestone: dossier?.expectations?.expectedMilestone?.trim() || undefined,
    preferredChannel: dossier?.expectations?.preferredChannel?.trim() || undefined,
    proposedNote: dossier?.expectations?.proposedNote?.trim() || project.mentorshipNeeds?.trim() || undefined,
  };

  return {
    version: 1,
    additionalMessage: dossier?.additionalMessage?.trim() || undefined,
    generatedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      abstract: approvedAbstract,
      abstractApproved: Boolean(approvedAbstract),
      researchField: dossier?.researchField?.trim() || project.mentorshipResearchAreas[0] || undefined,
      researchAreas,
      keywords,
      stage: project.status as ProjectStatus,
      primaryObjective: truncateText(dossier?.approvedObjective, 500),
      teamMemberCount,
    },
    team: {
      teamMemberCount,
      representative,
      sharedMembersCount: sharedMembers.length,
      sharedMembers,
      teamOverviewNote: truncateText(dossier?.teamOverviewNote, 400),
      privacyRedactedCount,
    },
    competencies,
    whyThisLecturer: {
      message: message.trim(),
      lecturerName: mentorBundle?.user.fullName ?? undefined,
      lecturerInstitution: mentorBundle?.affiliation?.institutionName
        || mentorBundle?.user.institution
        || undefined,
    },
    expectations,
    accessPreview: buildAccessSummary(mentorRole, access, undefined, params.expiresAt),
  };
}

export function extractSnapshotDossierConfig(snapshot: unknown): {
  dossierInput?: InvitationDossierInput;
  frozenDossier?: InvitationDossier;
} {
  if (!snapshot || typeof snapshot !== "object") return {};
  const record = snapshot as Record<string, unknown>;
  return {
    dossierInput: record.dossierConfig && typeof record.dossierConfig === "object"
      ? (record.dossierConfig as InvitationDossierInput)
      : undefined,
    frozenDossier: record.dossier && typeof record.dossier === "object"
      ? (record.dossier as InvitationDossier)
      : undefined,
  };
}

export async function projectRequestDossiers(
  db: WorkspaceDb,
  requests: Array<{
    id: string;
    projectId: string;
    requestedBy: string;
    mentorUserId: string;
    mentorRole: string | null;
    message: string | null;
    expiresAt: Date | null;
    invitationSnapshot: unknown;
    createdAt: Date;
  }>,
  viewerId: string,
  policyMap: Map<string, MentorAccessPolicy>,
  shareTitlesByAccessId: Map<string, string[]>,
  projectPreviewMap: Map<string, {
    id: string;
    title: string;
    summary: string;
    researchField?: string;
    researchAreas: string[];
    expertise: string[];
    stage: string;
    mentoringNeeds: string;
    teamMemberCount?: number;
  }>,
): Promise<Map<string, InvitationDossier>> {
  const out = new Map<string, InvitationDossier>();
  const nonLegacy = requests.filter(r => {
    const { frozenDossier } = extractSnapshotDossierConfig(r.invitationSnapshot);
    if (frozenDossier?.presentation === "BRIEF") {
      // The approved brief is immutable; never enrich it with today's profiles/team.
      out.set(r.id, frozenDossier);
      return false;
    }
    const snap = r.invitationSnapshot && typeof r.invitationSnapshot === "object"
      ? (r.invitationSnapshot as Record<string, unknown>)
      : null;
    return Boolean(snap?.project || snap?.dossier);
  });
  if (!nonLegacy.length) return out;

  const projectIds = [...new Set(nonLegacy.map(r => r.projectId))];
  const allMembers = await db.projectMember.findMany({
    where: { projectId: { in: projectIds }, status: "ACTIVE" },
    select: { projectId: true, userId: true, role: true },
  });
  const membersByProject = new Map<string, Array<{ userId: string; role: string }>>();
  for (const m of allMembers) {
    const bucket = membersByProject.get(m.projectId) ?? [];
    bucket.push({ userId: m.userId, role: m.role });
    membersByProject.set(m.projectId, bucket);
  }

  const userIds = [
    ...nonLegacy.map(r => r.requestedBy),
    ...nonLegacy.map(r => r.mentorUserId),
    ...allMembers.map(m => m.userId),
  ];
  const bundles = await loadProfileBundles(db, userIds);

  for (const r of nonLegacy) {
    const { dossierInput, frozenDossier } = extractSnapshotDossierConfig(r.invitationSnapshot);
    const preview = projectPreviewMap.get(r.projectId);
    const projectMembers = membersByProject.get(r.projectId) ?? [];
    const distinctTeamIds = new Set([r.requestedBy, ...projectMembers.map(m => m.userId)]);
    const teamMemberCount = frozenDossier?.project.teamMemberCount ?? preview?.teamMemberCount ?? distinctTeamIds.size;

    const representative = projectStudentProfile(bundles.get(r.requestedBy), viewerId, {
      shareProfile: dossierInput?.shareRepresentativeProfile,
      shareLinks: dossierInput?.shareRepresentativeLinks,
      shareWorks: dossierInput?.shareRepresentativeWorks,
    });

    const sharedMembers: DossierTeamMemberSummary[] = [];
    let privacyRedactedCount = 0;
    if (dossierInput?.shareTeamOverview) {
      for (const m of projectMembers) {
        if (m.userId === r.requestedBy) continue;
        const b = bundles.get(m.userId);
        const role = m.role === "OWNER" ? "OWNER" : "MEMBER";
        const summary = b ? projectTeamMemberSummary(b, role, viewerId) : null;
        if (summary) {
          if (sharedMembers.length < 6) sharedMembers.push(summary);
        } else {
          privacyRedactedCount += 1;
        }
      }
    } else {
      privacyRedactedCount = Math.max(0, teamMemberCount - 1);
    }

    const competencies = buildCompetencies(representative, sharedMembers, dossierInput ?? {
      researchMethods: frozenDossier?.competencies.researchMethods.map(i => i.name),
      researchTools: frozenDossier?.competencies.researchTools.map(i => i.name),
      teamOverviewNote: frozenDossier?.competencies.teamStrengthsNote,
    });

    const mentorBundle = bundles.get(r.mentorUserId);
    const livePolicy = policyMap.get(r.id);
    const shareTitles = livePolicy ? shareTitlesByAccessId.get(livePolicy.id) : undefined;
    const mentorRole = r.mentorRole as MentorRole;

    const projectSection = frozenDossier?.project ?? {
      id: r.projectId,
      title: preview?.title ?? "Dự án nghiên cứu",
      abstract: preview?.summary ?? "",
      abstractApproved: Boolean(preview?.summary?.trim()),
      researchField: preview?.researchField,
      researchAreas: preview?.researchAreas ?? [],
      keywords: cleanList([...(preview?.researchAreas ?? []), ...(preview?.expertise ?? [])], 10),
      stage: (preview?.stage ?? "PLANNING") as ProjectStatus,
      teamMemberCount,
    };

    const expectations = frozenDossier?.expectations ?? {
      supportAreas: [],
      proposedNote: preview?.mentoringNeeds || undefined,
    };

    out.set(r.id, {
      version: 1,
      additionalMessage: frozenDossier?.additionalMessage,
      generatedAt: frozenDossier?.generatedAt ?? r.createdAt.toISOString(),
      project: { ...projectSection, teamMemberCount },
      team: {
        teamMemberCount,
        representative,
        sharedMembersCount: sharedMembers.length,
        sharedMembers,
        teamOverviewNote: frozenDossier?.team.teamOverviewNote ?? truncateText(dossierInput?.teamOverviewNote, 400),
        privacyRedactedCount,
      },
      competencies,
      whyThisLecturer: frozenDossier?.whyThisLecturer ?? {
        message: (r.message ?? "").trim(),
        lecturerName: mentorBundle?.user.fullName ?? undefined,
        lecturerInstitution: mentorBundle?.affiliation?.institutionName
          || mentorBundle?.user.institution
          || undefined,
      },
      expectations,
      accessPreview: buildAccessSummary(
        mentorRole,
        undefined,
        livePolicy,
        r.expiresAt?.toISOString() ?? null,
        shareTitles,
      ),
    });
  }

  return out;
}
