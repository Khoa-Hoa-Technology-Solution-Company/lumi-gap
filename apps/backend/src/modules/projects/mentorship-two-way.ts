import { createHash } from "node:crypto";
import { z } from "zod";
import {
  hasMeaningfulResearchText,
  mentorPermissions,
  normalizeAcademicExpertise,
  type DossierFeaturedWork,
  type MentorPermission,
  type MentorPreset,
  type MentorProspectiveAccessPolicy,
  type MentorRecruitmentProfile,
  type MentorRole,
  type MentorshipProposalTerms,
  type ProjectMemberMentorshipConsent,
  type ProjectStatus,
  type ResearchSupportType,
  type ResearchTeamDossier,
  type TeamDossierConsentedMember,
} from "@trend/shared-types";
import type { Prisma, Project } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { readResearchClassification } from "../taxonomy/research-classification.service.js";
import { validateMentorPermissions } from "./mentor-access.service.js";
import { attachmentFields, invitationAttachmentDto } from "./mentorship-content.service.js";
import { mentorPositions } from "./mentorship-positions.js";

type Db = Prisma.TransactionClient;

export const RESEARCH_SUPPORT_TYPE_VALUES = [
  "RESEARCH_DIRECTION",
  "LITERATURE_REVIEW",
  "RESEARCH_GAP_VALIDATION",
  "RESEARCH_METHODOLOGY",
  "EXPERIMENT_DESIGN",
  "DATA_ANALYSIS",
  "ACADEMIC_WRITING",
  "SOFTWARE_TECHNICAL_GUIDANCE",
] as const;

export const MENTOR_FREQUENCY_VALUES = ["FLEXIBLE", "WEEKLY", "BIWEEKLY", "MONTHLY", "MILESTONE_BASED"] as const;
export const MENTOR_DURATION_VALUES = ["FLEXIBLE", "1_SEMESTER", "2_SEMESTERS", "FULL_PROJECT"] as const;
export const MENTOR_WORKING_MODE_VALUES = ["FLEXIBLE", "ONLINE", "HYBRID", "IN_PERSON"] as const;

const trimmedText = (max: number) => z.string().trim().max(max);
const trimmedList = (maxItems: number, maxLen: number) =>
  z.array(z.string().trim().min(1).max(maxLen)).max(maxItems).transform(items => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const key = item.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  });

export const prospectiveAccessInputSchema = z.object({
  preset: z.enum(["OBSERVER", "ADVISOR", "REVIEWER"]),
  permissions: z.array(z.enum(mentorPermissions)).min(1).max(mentorPermissions.length),
  expiresAt: z.string().datetime().nullable().default(null),
  scopeNote: trimmedText(500).optional(),
}).strict();

export const mentorRecruitmentProfileInputSchema = z.object({
  researchProblem: trimmedText(1200).optional(),
  researchObjectives: trimmedList(8, 300).optional(),
  researchQuestions: trimmedList(8, 300).optional(),
  expectedOutcomes: trimmedText(1000).optional(),
  expectedDuration: trimmedText(80).optional(),
  expectedFrequency: trimmedText(80).optional(),
  workingMode: trimmedText(80).optional(),
  mentoringGoals: trimmedText(1000).optional(),
  progressSummary: z.object({
    completed: trimmedText(1000).optional(),
    inProgress: trimmedText(1000).optional(),
    notStarted: trimmedText(1000).optional(),
    challenges: trimmedText(1000).optional(),
    feedbackNeeded: trimmedText(1000).optional(),
    upcomingMilestone: trimmedText(400).optional(),
  }).strict().optional(),
  recruitingRoles: z.array(z.enum(["PRIMARY", "SECONDARY"])).max(2).refine(roles => new Set(roles).size === roles.length).optional(),
  sharedAttachmentIds: z.array(z.string().uuid()).max(5).refine(ids => new Set(ids).size === ids.length).optional(),
  prospectiveAccess: prospectiveAccessInputSchema.nullable().optional(),
}).strict();

export const memberMentorshipConsentSchema = z.object({
  shared: z.boolean(),
  roleNote: trimmedText(200).optional(),
}).strict();

export const proposalAvailabilitySchema = z.object({
  frequency: trimmedText(80).optional(),
  duration: trimmedText(80).optional(),
  mode: trimmedText(80).optional(),
  note: trimmedText(600).optional(),
}).strict();

export const formalMentorshipProposalSchema = z.object({
  mentorRole: z.enum(["UNASSIGNED", "PRIMARY", "SECONDARY"]),
  supportAreas: z.array(z.enum(RESEARCH_SUPPORT_TYPE_VALUES)).min(1).max(8).refine(items => new Set(items).size === items.length),
  availability: proposalAvailabilitySchema.optional(),
  message: z.string().trim().min(20).max(2000).refine(hasMeaningfulResearchText, "Describe how you can support this research team"),
  consentConfirmed: z.literal(true),
  expectedDiscoveryVersion: z.number().int().positive(),
  expectedPolicyHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().uuid(),
}).strict();

export const counterProposalSchema = z.object({
  mentorRole: z.enum(["UNASSIGNED", "PRIMARY", "SECONDARY"]),
  supportAreas: z.array(z.enum(RESEARCH_SUPPORT_TYPE_VALUES)).min(1).max(8).refine(items => new Set(items).size === items.length),
  availability: proposalAvailabilitySchema.optional(),
  message: z.string().trim().min(10).max(2000),
  changeSummary: z.string().trim().min(5).max(500),
  access: z.object({
    preset: z.enum(["OBSERVER", "ADVISOR", "REVIEWER"]),
    permissions: z.array(z.enum(mentorPermissions)).min(1).max(mentorPermissions.length),
    expiresAt: z.string().datetime().nullable().default(null),
  }).strict().optional(),
  requestedAccessNote: trimmedText(500).optional(),
  expectedProposalVersion: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
}).strict();

export const clarificationMessageSchema = z.object({
  body: z.string().trim().min(5).max(2000),
  clientKey: z.string().uuid(),
}).strict();

export function computeProspectivePolicyHash(input: {
  preset: MentorPreset;
  permissions: readonly MentorPermission[];
  expiresAt: string | null;
  scopeNote?: string;
}): string {
  const canonical = {
    preset: input.preset,
    permissions: [...new Set(input.permissions)].sort(),
    expiresAt: input.expiresAt ?? null,
    scopeNote: (input.scopeNote ?? "").trim(),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringList(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

export function parseProspectiveAccess(raw: unknown): MentorProspectiveAccessPolicy | null {
  const obj = asObject(raw);
  const preset = obj.preset;
  if (preset !== "OBSERVER" && preset !== "ADVISOR" && preset !== "REVIEWER") return null;
  const rawPerms = Array.isArray(obj.permissions)
    ? obj.permissions.filter((p): p is MentorPermission => typeof p === "string" && (mentorPermissions as readonly string[]).includes(p))
    : [];
  if (!rawPerms.length) return null;
  const permissions = [...new Set(rawPerms)];
  const expiresAt = typeof obj.expiresAt === "string" && obj.expiresAt.trim() ? obj.expiresAt.trim() : null;
  const scopeNote = asString(obj.scopeNote);
  const policyHash = asString(obj.policyHash) ?? computeProspectivePolicyHash({ preset, permissions, expiresAt, scopeNote });
  return {
    preset,
    permissions,
    expiresAt,
    ...(scopeNote ? { scopeNote } : {}),
    ...(asString(obj.approvedAt) ? { approvedAt: asString(obj.approvedAt) } : {}),
    ...(asString(obj.approvedById) ? { approvedById: asString(obj.approvedById) } : {}),
    policyHash,
  };
}

export function parseMentorshipProfile(raw: unknown): MentorRecruitmentProfile {
  const obj = asObject(raw);
  const progressRaw = asObject(obj.progressSummary);
  const progressSummary = {
    ...(asString(progressRaw.completed) ? { completed: asString(progressRaw.completed) } : {}),
    ...(asString(progressRaw.inProgress) ? { inProgress: asString(progressRaw.inProgress) } : {}),
    ...(asString(progressRaw.notStarted) ? { notStarted: asString(progressRaw.notStarted) } : {}),
    ...(asString(progressRaw.challenges) ? { challenges: asString(progressRaw.challenges) } : {}),
    ...(asString(progressRaw.feedbackNeeded) ? { feedbackNeeded: asString(progressRaw.feedbackNeeded) } : {}),
    ...(asString(progressRaw.upcomingMilestone) ? { upcomingMilestone: asString(progressRaw.upcomingMilestone) } : {}),
  };
  const recruitingRoles = Array.isArray(obj.recruitingRoles)
    ? [...new Set(obj.recruitingRoles.filter((r): r is "PRIMARY" | "SECONDARY" => r === "PRIMARY" || r === "SECONDARY"))]
    : [];
  const sharedAttachmentIds = Array.isArray(obj.sharedAttachmentIds)
    ? [...new Set(obj.sharedAttachmentIds.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))]
    : [];
  const prospectiveAccess = obj.prospectiveAccess ? parseProspectiveAccess(obj.prospectiveAccess) : null;
  const researchSupportNeeds = Array.isArray(obj.researchSupportNeeds)
    ? obj.researchSupportNeeds.filter((item): item is NonNullable<MentorRecruitmentProfile["researchSupportNeeds"]>[number] =>
        Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" && typeof (item as { title?: unknown }).title === "string"),
      )
    : [];
  const selectedChallenges = Array.isArray(obj.selectedChallenges)
    ? obj.selectedChallenges.filter((item): item is NonNullable<MentorRecruitmentProfile["selectedChallenges"]>[number] => typeof item === "string")
    : [];
  const needsUpdatedAt = asString(obj.needsUpdatedAt);

  return {
    ...(asString(obj.researchProblem) ? { researchProblem: asString(obj.researchProblem) } : {}),
    ...(asStringList(obj.researchObjectives, 8).length ? { researchObjectives: asStringList(obj.researchObjectives, 8) } : {}),
    ...(asStringList(obj.researchQuestions, 8).length ? { researchQuestions: asStringList(obj.researchQuestions, 8) } : {}),
    ...(asString(obj.expectedOutcomes) ? { expectedOutcomes: asString(obj.expectedOutcomes) } : {}),
    ...(asString(obj.expectedDuration) ? { expectedDuration: asString(obj.expectedDuration) } : {}),
    ...(asString(obj.expectedFrequency) ? { expectedFrequency: asString(obj.expectedFrequency) } : {}),
    ...(asString(obj.workingMode) ? { workingMode: asString(obj.workingMode) } : {}),
    ...(asString(obj.mentoringGoals) ? { mentoringGoals: asString(obj.mentoringGoals) } : {}),
    ...(Object.keys(progressSummary).length ? { progressSummary } : {}),
    ...(recruitingRoles.length ? { recruitingRoles } : {}),
    ...(sharedAttachmentIds.length ? { sharedAttachmentIds } : {}),
    ...(prospectiveAccess ? { prospectiveAccess } : {}),
    ...(researchSupportNeeds.length ? { researchSupportNeeds } : {}),
    ...(selectedChallenges.length ? { selectedChallenges } : {}),
    ...(needsUpdatedAt ? { needsUpdatedAt } : {}),
  };
}

export function normalizeProspectiveAccessForSave(
  input: z.infer<typeof prospectiveAccessInputSchema>,
  ownerId: string,
): MentorProspectiveAccessPolicy {
  validateMentorPermissions(input.permissions);
  if (input.expiresAt && new Date(input.expiresAt) <= new Date()) {
    throw AppError.badRequest("Hạn truy cập dự kiến phải nằm trong tương lai");
  }
  const permissions = [...new Set(input.permissions)];
  const scopeNote = input.scopeNote?.trim() || undefined;
  const policyHash = computeProspectivePolicyHash({
    preset: input.preset,
    permissions,
    expiresAt: input.expiresAt,
    scopeNote,
  });
  return {
    preset: input.preset,
    permissions,
    expiresAt: input.expiresAt,
    ...(scopeNote ? { scopeNote } : {}),
    approvedAt: new Date().toISOString(),
    approvedById: ownerId,
    policyHash,
  };
}

export function parseTermsSnapshot(raw: unknown): MentorshipProposalTerms | undefined {
  const obj = asObject(raw);
  const kind = obj.proposalKind;
  if (kind !== "FORMAL_PROPOSAL" && kind !== "INVITATION" && kind !== "COUNTER_PROPOSAL") return undefined;
  const supportAreas = Array.isArray(obj.supportAreas)
    ? obj.supportAreas.filter((s): s is ResearchSupportType => typeof s === "string" && (RESEARCH_SUPPORT_TYPE_VALUES as readonly string[]).includes(s))
    : [];
  const availObj = asObject(obj.availability);
  const availability = {
    ...(asString(availObj.frequency) ? { frequency: asString(availObj.frequency) } : {}),
    ...(asString(availObj.duration) ? { duration: asString(availObj.duration) } : {}),
    ...(asString(availObj.mode) ? { mode: asString(availObj.mode) } : {}),
    ...(asString(availObj.note) ? { note: asString(availObj.note) } : {}),
  };
  const needConfirmations = Array.isArray(obj.needConfirmations)
    ? obj.needConfirmations.filter((item): item is NonNullable<MentorshipProposalTerms["needConfirmations"]>[number] =>
        Boolean(
          item &&
          typeof item === "object" &&
          typeof (item as { needId?: unknown }).needId === "string" &&
          typeof (item as { needTitle?: unknown }).needTitle === "string" &&
          ["CAN_SUPPORT", "NEEDS_DISCUSSION", "OUTSIDE_SCOPE"].includes(String((item as { response?: unknown }).response)),
        ),
      )
    : [];
  return {
    proposalKind: kind,
    supportAreas,
    ...(needConfirmations.length ? { needConfirmations } : {}),
    ...(Object.keys(availability).length ? { availability } : {}),
    ...(asString(obj.prospectivePolicyHash) ? { prospectivePolicyHash: asString(obj.prospectivePolicyHash) } : {}),
    ...(typeof obj.prospectivePolicyVersion === "number" ? { prospectivePolicyVersion: obj.prospectivePolicyVersion } : {}),
    ...(asString(obj.consentConfirmedAt) ? { consentConfirmedAt: asString(obj.consentConfirmedAt) } : {}),
    ...(asString(obj.consentActorId) ? { consentActorId: asString(obj.consentActorId) } : {}),
    ...(asString(obj.changeSummary) ? { changeSummary: asString(obj.changeSummary) } : {}),
    ...(asString(obj.requestedAccessNote) ? { requestedAccessNote: asString(obj.requestedAccessNote) } : {}),
  };
}

export async function computeAvailableMentorRoles(
  db: Db,
  projectId: string,
  recruitingRoles?: ("PRIMARY" | "SECONDARY")[],
): Promise<MentorRole[]> {
  const [positions, plan] = await Promise.all([
    mentorPositions(projectId, db),
    db.mentorInvitationPlan.findFirst({ where: { projectId, status: "ACTIVE" }, select: { closedRoles: true } }),
  ]);
  if (positions.UNASSIGNED.status === "ASSIGNED") return [];
  const closed = new Set(plan?.closedRoles ?? []);
  const roles: MentorRole[] = [];
  const candidates: readonly ("PRIMARY" | "SECONDARY")[] =
    recruitingRoles && recruitingRoles.length > 0 ? recruitingRoles : ["PRIMARY", "SECONDARY"];
  for (const role of candidates) {
    if (positions[role].status === "VACANT" && !closed.has(role)) roles.push(role);
  }
  if (!recruitingRoles?.length) roles.push("UNASSIGNED");
  return roles;
}

export async function loadMemberConsentSummary(db: Db, project: Pick<Project, "id" | "ownerId">) {
  const rows = await db.projectMember.findMany({
    where: { projectId: project.id, status: "ACTIVE" },
    select: { userId: true, role: true, mentorshipProfileShared: true, mentorshipRoleNote: true, mentorshipConsentUpdatedAt: true },
  });
  const memberByUserId = new Map(rows.map(r => [r.userId, r]));
  const allIds = [...new Set([project.ownerId, ...rows.map(r => r.userId)])];
  const [users, profiles] = await Promise.all([
    db.user.findMany({ where: { id: { in: allIds }, isActive: true, accountStatus: "ACTIVE" }, select: { id: true, legacyMongoId: true, fullName: true } }),
    db.academicProfile.findMany({ where: { userId: { in: allIds } }, select: { userId: true, profileVisibility: true } }),
  ]);
  const userMap = new Map(users.map(u => [u.id, u]));
  const profileMap = new Map(profiles.map(p => [p.userId, p]));
  const members = allIds
    .map(userId => {
      const user = userMap.get(userId);
      if (!user) return null;
      const memberRow = memberByUserId.get(userId);
      const visibility = (profileMap.get(userId)?.profileVisibility ?? "PUBLIC") as "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
      const consented = Boolean(memberRow?.mentorshipProfileShared);
      return {
        userId: publicDatabaseId(user),
        fullName: user.fullName,
        role: (userId === project.ownerId ? "OWNER" : "MEMBER") as "OWNER" | "MEMBER",
        consented,
        profileVisibility: visibility,
        effectiveVisibleToLecturers: consented && visibility !== "PRIVATE",
        ...(memberRow?.mentorshipRoleNote ? { roleNote: memberRow.mentorshipRoleNote } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    totalMembers: members.length,
    consentedCount: members.filter(m => m.effectiveVisibleToLecturers).length,
    members,
  };
}

export async function getMyMemberConsent(
  db: Db,
  project: Pick<Project, "id" | "ownerId">,
  userId: string,
): Promise<ProjectMemberMentorshipConsent> {
  const [memberRow, profile] = await Promise.all([
    db.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId } },
      select: { status: true, mentorshipProfileShared: true, mentorshipRoleNote: true, mentorshipConsentUpdatedAt: true },
    }),
    db.academicProfile.findUnique({ where: { userId }, select: { profileVisibility: true } }),
  ]);
  if (project.ownerId !== userId && memberRow?.status !== "ACTIVE") {
    throw AppError.forbidden("Chỉ thành viên đang hoạt động của dự án mới có quyền thiết lập chia sẻ hồ sơ");
  }
  const profileVisibility = (profile?.profileVisibility ?? "PUBLIC") as "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
  const shared = Boolean(memberRow?.mentorshipProfileShared);
  return {
    projectId: publicDatabaseId(project),
    userId,
    shared,
    ...(memberRow?.mentorshipRoleNote ? { roleNote: memberRow.mentorshipRoleNote } : {}),
    profileVisibility,
    effectiveVisibleToLecturers: shared && profileVisibility !== "PRIVATE",
    ...(memberRow?.mentorshipConsentUpdatedAt ? { updatedAt: memberRow.mentorshipConsentUpdatedAt.toISOString() } : {}),
  };
}

const CONFIDENTIALITY_NOTICE =
  "Thông tin trong hồ sơ này chỉ dùng để giảng viên cân nhắc hướng dẫn nghiên cứu. Không sao chép, phân phối hoặc sử dụng ý tưởng nghiên cứu cho mục đích khác.";

const BEFORE_ACCEPT_NOTICE =
  "Trước khi quan hệ hướng dẫn được kích hoạt, giảng viên chỉ xem được hồ sơ giới thiệu và tài liệu được phép chia sẻ tại đây — chưa truy cập bản thảo, thư viện tài liệu hay trao đổi nội bộ của dự án.";

function fieldPrivate(privacy: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(k => privacy[k] === "PRIVATE");
}

function formatCohort(cohort?: string | null, startYear?: number | null): string | undefined {
  const cleaned = cohort?.trim();
  if (cleaned) return cleaned;
  if (typeof startYear === "number" && startYear >= 1980 && startYear <= 2100) return `Khóa ${startYear}`;
  return undefined;
}

export async function buildResearchTeamDossier(
  db: Db,
  project: Project,
  previewTokenValue: string,
  options: {
    viewerUserId?: string;
    isOwnerPreview?: boolean;
  } = {},
): Promise<ResearchTeamDossier> {
  const profileData = parseMentorshipProfile(project.mentorshipProfile);
  const activeMembers = await db.projectMember.findMany({
    where: { projectId: project.id, status: "ACTIVE" },
    select: { userId: true, role: true, mentorshipProfileShared: true, mentorshipRoleNote: true },
  });
  const memberByUserId = new Map(activeMembers.map(m => [m.userId, m]));
  const distinctMemberIds = [...new Set([project.ownerId, ...activeMembers.map(m => m.userId)])];
  const teamMemberCount = distinctMemberIds.length;

  // Strictly opt-in contextual sharing consent: only members with mentorshipProfileShared = true
  const consentedCandidateIds = distinctMemberIds.filter(id => Boolean(memberByUserId.get(id)?.mentorshipProfileShared));

  const [users, profiles, affiliations] = consentedCandidateIds.length
    ? await Promise.all([
        db.user.findMany({
          where: { id: { in: consentedCandidateIds }, isActive: true, accountStatus: "ACTIVE" },
          select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, institution: true, researchInterests: true },
        }),
        db.academicProfile.findMany({
          where: { userId: { in: consentedCandidateIds } },
          select: {
            id: true,
            userId: true,
            publicHandle: true,
            academicRole: true,
            positionTitle: true,
            headline: true,
            biography: true,
            affiliationStartYear: true,
            expertiseAreas: true,
            researchSpecializations: true,
            skills: true,
            researchKeywords: true,
            profileVisibility: true,
            privacySettings: true,
            positionStatus: true,
          },
        }),
        db.affiliation.findMany({
          where: { userId: { in: consentedCandidateIds }, isCurrent: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
          select: {
            userId: true,
            institutionName: true,
            department: true,
            cohort: true,
            programId: true,
            verificationStatus: true,
          },
        }),
      ])
    : [[], [], []];

  const profileIds = profiles.filter(p => p.profileVisibility !== "PRIVATE").map(p => p.id);
  const programIds = [...new Set(affiliations.map(a => a.programId).filter((v): v is string => Boolean(v)))];
  const [works, programs, sharedAttachmentsRaw, availableRoles] = await Promise.all([
    profileIds.length
      ? db.academicFeaturedWork.findMany({
          where: { profileId: { in: profileIds } },
          orderBy: { position: "asc" },
          select: { id: true, profileId: true, kind: true, title: true, year: true, doi: true, source: true },
        })
      : Promise.resolve([]),
    programIds.length
      ? db.academicProgram.findMany({ where: { id: { in: programIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    profileData.sharedAttachmentIds?.length
      ? db.mentorshipAttachment.findMany({
          where: { id: { in: profileData.sharedAttachmentIds }, projectId: project.id, uploadedById: project.ownerId },
          select: attachmentFields,
        })
      : Promise.resolve([]),
    computeAvailableMentorRoles(db, project.id, profileData.recruitingRoles),
  ]);

  const userMap = new Map(users.map(u => [u.id, u]));
  const profileMap = new Map(profiles.map(p => [p.userId, p]));
  const affiliationMap = new Map<string, (typeof affiliations)[number]>();
  for (const a of affiliations) if (!affiliationMap.has(a.userId)) affiliationMap.set(a.userId, a);
  const programMap = new Map(programs.map(p => [p.id, p.name]));
  const worksByProfile = new Map<string, typeof works>();
  for (const w of works) {
    const bucket = worksByProfile.get(w.profileId) ?? [];
    bucket.push(w);
    worksByProfile.set(w.profileId, bucket);
  }

  const consentedMembers: TeamDossierConsentedMember[] = [];
  for (const userId of consentedCandidateIds) {
    const u = userMap.get(userId);
    const ap = profileMap.get(userId);
    // Never override an individual's PRIVATE profile visibility!
    if (!u || !ap || ap.profileVisibility === "PRIVATE") continue;

    const privacy = asObject(ap.privacySettings);
    const hideAffiliation = fieldPrivate(privacy, ["affiliation", "institution"]);
    const hideBio = fieldPrivate(privacy, ["biography", "headline"]);
    const hideInterests = fieldPrivate(privacy, ["researchInterests", "interests"]);
    const hideSkills = fieldPrivate(privacy, ["skills", "expertise"]);
    const hideWorks = fieldPrivate(privacy, ["featuredWorks", "works"]);

    const aff = affiliationMap.get(userId);
    const storedMethods = asStringList(privacy.researchMethods, 20);
    const normalized = normalizeAcademicExpertise({
      expertiseAreas: hideSkills ? [] : ap.expertiseAreas,
      researchSpecializations: hideSkills ? [] : ap.researchSpecializations,
      researchInterests: hideInterests ? [] : u.researchInterests,
      skills: hideSkills ? [] : ap.skills,
      researchMethods: hideSkills ? [] : storedMethods,
      researchKeywords: hideInterests ? [] : ap.researchKeywords,
    });

    const featuredWorks: DossierFeaturedWork[] = hideWorks
      ? []
      : (worksByProfile.get(ap.id) ?? [])
          .filter(w => Boolean(w.title?.trim()))
          .slice(0, 4)
          .map(w => ({
            id: w.id,
            kind: w.kind,
            title: w.title!.trim(),
            year: w.year ?? undefined,
            doi: w.doi ?? undefined,
            provenance: w.doi || w.source === "ORCID" ? "PUBLIC_WORK" : "SELF_DECLARED",
          }));

    const memberRow = memberByUserId.get(userId);
    const bioText = ap.biography?.trim();
    consentedMembers.push({
      userId: publicDatabaseId(u),
      ...(ap.publicHandle ? { publicHandle: ap.publicHandle } : {}),
      fullName: u.fullName,
      ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}),
      projectRole: userId === project.ownerId ? "OWNER" : "MEMBER",
      ...(memberRow?.mentorshipRoleNote ? { researchResponsibility: memberRow.mentorshipRoleNote } : {}),
      ...(ap.academicRole ? { academicRole: ap.academicRole } : {}),
      ...(!hideAffiliation && (aff?.institutionName || u.institution) ? { institutionName: aff?.institutionName || u.institution || undefined } : {}),
      ...(!hideAffiliation && aff?.department ? { department: aff.department } : {}),
      ...(!hideAffiliation && aff?.programId && programMap.get(aff.programId) ? { programName: programMap.get(aff.programId) } : {}),
      ...(!hideAffiliation && formatCohort(aff?.cohort, ap.affiliationStartYear) ? { academicYearLabel: formatCohort(aff?.cohort, ap.affiliationStartYear) } : {}),
      ...(!hideBio && ap.headline ? { headline: ap.headline.slice(0, 160) } : {}),
      ...(!hideBio && bioText ? { shortBio: bioText.length > 320 ? `${bioText.slice(0, 319).trimEnd()}…` : bioText } : {}),
      researchInterests: hideInterests ? [] : normalized.researchAreas.slice(0, 8),
      skills: hideSkills ? [] : normalized.skills.slice(0, 10),
      researchMethods: hideSkills ? [] : normalized.researchMethods.slice(0, 8),
      featuredWorks,
      affiliationVerified: !hideAffiliation && Boolean(aff?.verificationStatus === "VERIFIED" || ap.positionStatus === "VERIFIED"),
    });
  }

  const prospectiveAccess = profileData.prospectiveAccess ?? null;
  const prospectivePolicyExpired = Boolean(prospectiveAccess?.expiresAt && new Date(prospectiveAccess.expiresAt) <= new Date());
  const projectOpen = !["ARCHIVED", "COMPLETED"].includes(project.status) && project.mentorshipDiscovery === "SEEKING_MENTOR";
  let canDirectPropose = false;
  let directProposeBlockedReason: string | undefined;

  if (!projectOpen) {
    directProposeBlockedReason = "PROJECT_NOT_SEEKING";
  } else if (!availableRoles.length) {
    directProposeBlockedReason = "NO_OPEN_ROLE";
  } else if (!prospectiveAccess) {
    directProposeBlockedReason = "PROSPECTIVE_ACCESS_NOT_CONFIGURED";
  } else if (prospectivePolicyExpired) {
    directProposeBlockedReason = "PROSPECTIVE_ACCESS_EXPIRED";
  } else {
    canDirectPropose = true;
  }

  const progress = profileData.progressSummary ?? {};
  const hasSharedProgress = Boolean(
    progress.completed || progress.inProgress || progress.notStarted || progress.challenges || progress.feedbackNeeded || progress.upcomingMilestone,
  );

  let viewerState: ResearchTeamDossier["viewerState"];
  if (options.viewerUserId && !options.isOwnerPreview) {
    const now = new Date();
    const [existingReq, existingRel] = await Promise.all([
      db.mentorshipRequest.findFirst({
        where: {
          projectId: project.id,
          mentorUserId: options.viewerUserId,
          status: "PENDING",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true, direction: true, status: true },
      }),
      db.mentorRelationship.findFirst({
        where: { projectId: project.id, mentorUserId: options.viewerUserId, status: "ACTIVE" },
        select: { id: true },
      }),
    ]);

    if (existingRel) {
      viewerState = { canPropose: false, blockedReason: "ALREADY_ACTIVE_MENTOR", existingRelationshipId: existingRel.id };
    } else if (existingReq) {
      viewerState = {
        canPropose: false,
        blockedReason: existingReq.direction === "PROJECT_TO_LECTURER" ? "INCOMING_INVITATION_EXISTS" : "PROPOSAL_ALREADY_PENDING",
        existingRequestId: existingReq.id,
        existingRequestDirection: existingReq.direction as "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT",
        existingRequestStatus: existingReq.status as ResearchTeamDossier["viewerState"] extends { existingRequestStatus?: infer S } ? S : never,
      };
    } else {
      viewerState = {
        canPropose: canDirectPropose,
        ...(directProposeBlockedReason ? { blockedReason: directProposeBlockedReason } : {}),
      };
    }
  }

  const classification = readResearchClassification(project.mentorshipClassification);
  return {
    projectId: publicDatabaseId(project),
    discovery: project.mentorshipDiscovery as "CLOSED" | "SEEKING_MENTOR",
    discoveryVersion: project.version,
    previewToken: previewTokenValue,
    overview: {
      title: project.title,
      summary: project.mentorshipSummary ?? "",
      ...(project.mentorshipResearchAreas[0] ? { researchField: project.mentorshipResearchAreas[0] } : {}),
      researchAreas: project.mentorshipResearchAreas,
      ...(classification ? { researchClassification: classification } : {}),
      methodologies: project.mentorshipMethodologies,
      stage: project.status as ProjectStatus,
      ...(profileData.researchProblem ? { researchProblem: profileData.researchProblem } : {}),
      researchObjectives: profileData.researchObjectives ?? [],
      researchQuestions: profileData.researchQuestions ?? [],
      ...(profileData.expectedOutcomes ? { expectedOutcomes: profileData.expectedOutcomes } : {}),
      ...(profileData.expectedDuration ? { expectedDuration: profileData.expectedDuration } : {}),
    },
    team: {
      teamMemberCount,
      consentedMembers,
      unsharedMemberCount: Math.max(0, teamMemberCount - consentedMembers.length),
    },
    progress: {
      stage: project.status as ProjectStatus,
      ...progress,
      hasSharedProgress,
    },
    needs: {
      supportTypes: project.mentorshipSupportTypes as ResearchSupportType[],
      expertise: project.mentorshipExpertise,
      methodologies: project.mentorshipMethodologies,
      mentoringNeeds: project.mentorshipNeeds,
      ...(profileData.researchSupportNeeds?.filter(n => n.status === "CONFIRMED").length
        ? { researchSupportNeeds: profileData.researchSupportNeeds.filter(n => n.status === "CONFIRMED") }
        : {}),
      availableRoles,
      recruitingRoles: profileData.recruitingRoles ?? [],
      ...(profileData.expectedDuration ? { expectedDuration: profileData.expectedDuration } : {}),
      ...(profileData.expectedFrequency ? { expectedFrequency: profileData.expectedFrequency } : {}),
      ...(profileData.workingMode ? { workingMode: profileData.workingMode } : {}),
      ...(profileData.mentoringGoals ? { mentoringGoals: profileData.mentoringGoals } : {}),
    },
    collaborationTerms: {
      sharedAttachments: sharedAttachmentsRaw.map(file => invitationAttachmentDto(file)),
      prospectiveAccess,
      canDirectPropose,
      ...(directProposeBlockedReason ? { directProposeBlockedReason } : {}),
      confidentialityNotice: CONFIDENTIALITY_NOTICE,
      beforeAcceptNotice: BEFORE_ACCEPT_NOTICE,
    },
    ...(viewerState ? { viewerState } : {}),
  };
}
