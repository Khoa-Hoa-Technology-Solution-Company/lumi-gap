import type {
  AcademicReviewMode,
  CreateReviewTemplateInput,
  ReviewTemplateSource,
  ReviewTemplateVersionInput,
  SystemRole,
} from "@trend/shared-types";
import { isAdminSystemRole, SCIENTIFIC_REVIEW_POLICIES } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { auditService } from "../audit/audit.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { nextTemplateVersionNumber, validateTemplateCriteriaConfig } from "./academic-review.rules.js";

function whereId(value: string): { id?: string; legacyMongoId?: string } {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

function clean(value: string | undefined | null): string | undefined {
  const normalized = value?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return normalized || undefined;
}

function criterionKey(title: string, index: number): string {
  const key = title.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (key || `criterion_${index + 1}`).slice(0, 72);
}

async function resolveUser(input: string) {
  const user = await getPrisma().user.findFirst({ where: whereId(input), select: { id: true, isActive: true } });
  if (!user?.isActive) throw AppError.unauthorized();
  return user;
}

async function canManageProjectTemplate(projectId: string, userId: string): Promise<boolean> {
  const project = await getPrisma().project.findUnique({ where: { id: projectId }, select: { ownerId: true, status: true, deletedAt: true } });
  return Boolean(project && !project.deletedAt && project.ownerId === userId && !["ARCHIVED", "COMPLETED"].includes(project.status));
}

async function assertManage(templateId: string, actorId: string, systemRole: SystemRole) {
  const template = await getPrisma().reviewTemplate.findFirst({ where: whereId(templateId) });
  if (!template) throw AppError.notFound("Review template not found");
  if (template.source === "SYSTEM") {
    if (!isAdminSystemRole(systemRole)) throw AppError.forbidden("Only administrators can manage LumiGap templates");
  } else if (template.source === "PERSONAL") {
    if (template.ownerId !== actorId) throw AppError.forbidden("You can manage only your own templates");
  } else if (!template.projectId || !await canManageProjectTemplate(template.projectId, actorId)) {
    throw AppError.forbidden("Only the project owner can manage project templates");
  }
  return template;
}

async function hydrateVersion(versionId: string) {
  const prisma = getPrisma();
  const version = await prisma.reviewTemplateVersion.findUnique({ where: { id: versionId } });
  if (!version) return undefined;
  const [template, criteria] = await Promise.all([
    prisma.reviewTemplate.findUnique({ where: { id: version.templateId }, select: { id: true, legacyMongoId: true, name: true, source: true } }),
    prisma.reviewCriterion.findMany({ where: { versionId }, orderBy: { order: "asc" } }),
  ]);
  const levels = await prisma.reviewCriterionLevel.findMany({
    where: { criterionId: { in: criteria.map((item) => item.id) } },
    orderBy: [{ criterionId: "asc" }, { position: "asc" }],
  });
  const levelMap = new Map<string, typeof levels>();
  for (const level of levels) levelMap.set(level.criterionId, [...(levelMap.get(level.criterionId) ?? []), level]);
  return {
    id: publicDatabaseId(version),
    templateId: template ? publicDatabaseId(template) : undefined,
    templateName: template?.name ?? undefined,
    templateSource: (template?.source as ReviewTemplateSource | undefined) ?? undefined,
    versionNumber: version.versionNumber,
    reviewMode: version.reviewMode as AcademicReviewMode,
    description: version.description ?? undefined,
    guidelines: version.guidelines,
    status: version.status as "DRAFT" | "PUBLISHED",
    publishedAt: version.publishedAt ?? undefined,
    criteria: criteria.map((item) => ({
      id: publicDatabaseId(item), key: item.key, title: item.label, description: item.description ?? undefined,
      required: item.required, allowNotApplicable: item.allowNotApplicable, weight: item.weight ?? undefined, order: item.order,
      levels: (levelMap.get(item.id) ?? []).map((level) => ({
        id: publicDatabaseId(level), label: level.label, description: level.description ?? undefined,
        score: level.score, position: level.position,
      })),
    })),
  };
}

async function hydrateTemplate(
  template: {
    id: string;
    legacyMongoId: string | null;
    name: string;
    description: string | null;
    source: string;
    artifactType: string | null;
    submissionType: string | null;
    status: string;
    ownerId: string | null;
    projectId: string | null;
    activeVersionId: string | null;
    active: boolean;
    updatedAt: Date;
  },
  context?: { actorId?: string; systemRole?: SystemRole; manageableProjectIds?: Set<string> },
) {
  const prisma = getPrisma();
  const [activeVersion, latestDraft] = await Promise.all([
    template.activeVersionId ? hydrateVersion(template.activeVersionId) : Promise.resolve(undefined),
    prisma.reviewTemplateVersion.findFirst({
      where: { templateId: template.id, status: "DRAFT" },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true },
    }),
  ]);
  const canManage = context?.actorId
    ? template.source === "SYSTEM"
      ? Boolean(context.systemRole && isAdminSystemRole(context.systemRole))
      : template.source === "PERSONAL"
        ? template.ownerId === context.actorId
        : Boolean(template.projectId && context.manageableProjectIds?.has(template.projectId))
    : undefined;
  return {
    id: publicDatabaseId(template),
    name: template.name,
    description: template.description ?? undefined,
    source: template.source as ReviewTemplateSource,
    artifactType: template.artifactType ?? template.submissionType ?? undefined,
    status: template.status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
    ownerId: template.ownerId ?? undefined,
    projectId: template.projectId ?? undefined,
    canManage,
    hasDraftVersion: Boolean(latestDraft),
    draftVersionNumber: latestDraft?.versionNumber,
    activeVersion,
    updatedAt: template.updatedAt,
  };
}

async function replaceCriteria(prisma: Prisma.TransactionClient, versionId: string, templateId: string, input: ReviewTemplateVersionInput) {
  const validationError = validateTemplateCriteriaConfig(input.reviewMode, input.criteria);
  if (validationError) throw AppError.badRequest(validationError);
  await prisma.reviewCriterion.deleteMany({ where: { versionId } });
  const usedKeys = new Set<string>();
  const isRubric = input.reviewMode === "RUBRIC_ASSESSMENT";
  for (const [index, item] of input.criteria.entries()) {
    const baseKey = clean(item.key) ?? criterionKey(item.title, index);
    let uniqueKey = baseKey;
    let suffix = 2;
    while (usedKeys.has(uniqueKey)) {
      const tag = `_${suffix}`;
      uniqueKey = `${baseKey.slice(0, 72 - tag.length)}${tag}`;
      suffix += 1;
    }
    usedKeys.add(uniqueKey);
    const criterion = await prisma.reviewCriterion.create({
      data: {
        templateId, versionId, key: uniqueKey, label: clean(item.title)!,
        description: clean(item.description),
        weight: isRubric ? item.weight : null,
        order: index,
        required: item.required, allowNotApplicable: item.allowNotApplicable,
      },
    });
    if (isRubric && item.levels?.length) {
      await prisma.reviewCriterionLevel.createMany({
        data: item.levels.map((level, position) => ({
          criterionId: criterion.id, label: clean(level.label)!, description: clean(level.description),
          score: level.score, position,
        })),
      });
    }
  }
}

export const reviewTemplateService = {
  async list(actorInput: string, options: { includeArchived?: boolean; systemRole?: SystemRole } = {}) {
    const actor = await resolveUser(actorInput);
    const prisma = getPrisma();
    const [memberships, owned, mentorRelations] = await Promise.all([
      prisma.projectMember.findMany({ where: { userId: actor.id, status: "ACTIVE" }, select: { projectId: true } }),
      prisma.project.findMany({ where: { ownerId: actor.id, deletedAt: null }, select: { id: true, status: true } }),
      prisma.mentorRelationship.findMany({ where: { mentorUserId: actor.id, status: "ACTIVE" }, select: { projectId: true } }),
    ]);
    const projectIds = [
      ...new Set([
        ...memberships.map((item) => item.projectId),
        ...owned.map((item) => item.id),
        ...mentorRelations.map((item) => item.projectId),
      ]),
    ];
    const manageableProjectIds = new Set(
      owned.filter(p => !["ARCHIVED", "COMPLETED"].includes(p.status)).map(p => p.id),
    );
    const rows = await prisma.reviewTemplate.findMany({
      where: {
        OR: [
          { active: true, source: "SYSTEM", status: "PUBLISHED" },
          { source: "PERSONAL", ownerId: actor.id, ...(options.includeArchived ? {} : { active: true }) },
          ...(projectIds.length
            ? [{ active: true, source: "PROJECT", projectId: { in: projectIds } }]
            : []),
        ],
      },
      orderBy: [{ source: "asc" }, { name: "asc" }],
    });
    const ctx = { actorId: actor.id, systemRole: options.systemRole, manageableProjectIds };
    return Promise.all(rows.map(row => hydrateTemplate(row, ctx)));
  },

  async detail(templateInput: string, actorInput: string, systemRole?: SystemRole) {
    const actor = await resolveUser(actorInput);
    const prisma = getPrisma();
    const template = await prisma.reviewTemplate.findFirst({ where: whereId(templateInput) });
    if (!template) throw AppError.notFound("Review template not found");

    // Strict per-template access check (no IDOR on private or unrelated project templates)
    if (template.source === "SYSTEM") {
      if ((!template.active || template.status !== "PUBLISHED") && !(systemRole && isAdminSystemRole(systemRole))) {
        throw AppError.notFound("Review template not found");
      }
    } else if (template.source === "PERSONAL") {
      if (template.ownerId !== actor.id) {
        throw AppError.notFound("Review template not found");
      }
    } else if (template.source === "PROJECT") {
      if (!template.projectId) throw AppError.notFound("Review template not found");
      const [project, membership, mentorRel] = await Promise.all([
        prisma.project.findUnique({ where: { id: template.projectId }, select: { ownerId: true, deletedAt: true } }),
        prisma.projectMember.findFirst({ where: { projectId: template.projectId, userId: actor.id, status: "ACTIVE" }, select: { id: true } }),
        prisma.mentorRelationship.findFirst({ where: { projectId: template.projectId, mentorUserId: actor.id, status: "ACTIVE" }, select: { id: true } }),
      ]);
      const hasProjectAccess = Boolean(project && !project.deletedAt && (project.ownerId === actor.id || membership || mentorRel));
      if (!hasProjectAccess || (!template.active && project?.ownerId !== actor.id)) {
        throw AppError.notFound("Review template not found");
      }
    }

    const manageableProjectIds = new Set<string>();
    if (template.source === "PROJECT" && template.projectId && await canManageProjectTemplate(template.projectId, actor.id)) {
      manageableProjectIds.add(template.projectId);
    }
    const summary = await hydrateTemplate(template, { actorId: actor.id, systemRole, manageableProjectIds });
    const versions = await prisma.reviewTemplateVersion.findMany({
      where: { templateId: template.id },
      orderBy: { versionNumber: "desc" },
    });
    return { ...summary, versions: await Promise.all(versions.map((version) => hydrateVersion(version.id))) };
  },

  async create(input: CreateReviewTemplateInput, actorInput: string, systemRole: SystemRole) {
    const actor = await resolveUser(actorInput);
    if (input.source === "SYSTEM" && !isAdminSystemRole(systemRole)) {
      throw AppError.forbidden("Only administrators can create LumiGap templates");
    }
    if (input.source === "PROJECT" && (!input.projectId || !await canManageProjectTemplate(input.projectId, actor.id))) {
      throw AppError.forbidden("Only the project owner can create a project template");
    }
    const validationError = validateTemplateCriteriaConfig(input.reviewMode, input.criteria);
    if (validationError) throw AppError.badRequest(validationError);
    const cleanName = clean(input.name);
    if (!cleanName || cleanName.length < 3) throw AppError.badRequest("Template name must be at least 3 characters");
    const status = input.publish ? "PUBLISHED" : "DRAFT";
    const cleanedArtifactType = clean(input.artifactType ?? undefined);
    const created = await getPrisma().$transaction(async (tx) => {
      const template = await tx.reviewTemplate.create({ data: {
        name: cleanName, description: clean(input.description), submissionType: cleanedArtifactType,
        artifactType: cleanedArtifactType, source: input.source,
        projectId: input.source === "PROJECT" ? input.projectId : undefined,
        ownerId: input.source === "SYSTEM" ? undefined : actor.id, status, active: true,
      } });
      const version = await tx.reviewTemplateVersion.create({ data: {
        templateId: template.id, versionNumber: 1, reviewMode: input.reviewMode,
        description: clean(input.description), guidelines: input.guidelines.map((item) => clean(item)!).filter(Boolean),
        status, createdById: actor.id, publishedAt: input.publish ? new Date() : undefined,
      } });
      await tx.reviewTemplate.update({ where: { id: template.id }, data: { activeVersionId: version.id } });
      await replaceCriteria(tx, version.id, template.id, input);
      return { template, version };
    });
    await auditService.log("TEMPLATE_CREATED", {
      userId: actor.id, targetTableName: "review_templates", targetRecordId: created.template.id,
      details: { source: input.source, reviewMode: input.reviewMode, version: 1 },
    });
    if (input.publish) await auditService.log("TEMPLATE_VERSION_PUBLISHED", {
      userId: actor.id, targetTableName: "review_template_versions", targetRecordId: created.version.id,
      details: { templateId: created.template.id, version: 1 },
    });
    const fresh = await getPrisma().reviewTemplate.findUniqueOrThrow({ where: { id: created.template.id } });
    return hydrateTemplate(fresh, {
      actorId: actor.id,
      systemRole,
      manageableProjectIds: fresh.projectId ? new Set([fresh.projectId]) : undefined,
    });
  },

  async saveVersion(templateInput: string, input: ReviewTemplateVersionInput, actorInput: string, systemRole: SystemRole) {
    const actor = await resolveUser(actorInput);
    const template = await assertManage(templateInput, actor.id, systemRole);
    const validationError = validateTemplateCriteriaConfig(input.reviewMode, input.criteria);
    if (validationError) throw AppError.badRequest(validationError);
    const nextName = input.name !== undefined ? clean(input.name) : undefined;
    if (input.name !== undefined && (!nextName || nextName.length < 3)) {
      throw AppError.badRequest("Template name must be at least 3 characters");
    }
    const cleanedGuidelines = input.guidelines.map((item) => clean(item)!).filter(Boolean);
    const versionId = await getPrisma().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM review_templates WHERE id = ${template.id}::uuid FOR UPDATE`;
      const live = await tx.reviewTemplate.findUniqueOrThrow({ where: { id: template.id } });
      if (!live.active) throw AppError.conflict("Archived templates are read-only");
      const versions = await tx.reviewTemplateVersion.findMany({ where: { templateId: template.id }, orderBy: { versionNumber: "desc" } });
      const hasPublished = versions.some(v => v.status === "PUBLISHED");
      let draft = versions.find(item => item.status === "DRAFT");
      if (!draft) {
        draft = await tx.reviewTemplateVersion.create({
          data: {
            templateId: template.id,
            versionNumber: nextTemplateVersionNumber(versions),
            reviewMode: input.reviewMode,
            description: clean(input.description),
            guidelines: cleanedGuidelines,
            status: "DRAFT",
            createdById: actor.id,
          },
        });
      } else {
        draft = await tx.reviewTemplateVersion.update({
          where: { id: draft.id },
          data: { reviewMode: input.reviewMode, description: clean(input.description), guidelines: cleanedGuidelines },
        });
      }
      await replaceCriteria(tx, draft.id, template.id, input);
      const active = live.activeVersionId ? await tx.reviewTemplateVersion.findUnique({ where: { id: live.activeVersionId } }) : null;
      const metadataPatch: Prisma.ReviewTemplateUpdateInput = {
        status: active?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
        ...(nextName ? { name: nextName } : {}),
        ...(input.artifactType !== undefined && !hasPublished
          ? { artifactType: clean(input.artifactType) ?? null, submissionType: clean(input.artifactType) ?? null }
          : {}),
        ...(!hasPublished ? { description: clean(input.description) ?? null } : {}),
      };
      await tx.reviewTemplate.update({ where: { id: template.id }, data: metadataPatch });
      return draft.id;
    });
    return hydrateVersion(versionId);
  },

  async publish(templateInput: string, actorInput: string, systemRole: SystemRole) {
    const actor = await resolveUser(actorInput);
    const template = await assertManage(templateInput, actor.id, systemRole);
    const draft = await getPrisma().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM review_templates WHERE id = ${template.id}::uuid FOR UPDATE`;
      const live = await tx.reviewTemplate.findUniqueOrThrow({ where: { id: template.id } });
      if (!live.active) throw AppError.conflict("Archived templates are read-only");
      const draft = await tx.reviewTemplateVersion.findFirst({ where: { templateId: template.id, status: "DRAFT" }, orderBy: { versionNumber: "desc" } });
      if (!draft) throw AppError.conflict("This template has no draft version to publish");
      const criteria = await tx.reviewCriterion.findMany({ where: { versionId: draft.id }, orderBy: { order: "asc" } });
      if (!criteria.length) throw AppError.badRequest("A template requires at least one criterion");
      const levels = draft.reviewMode === "RUBRIC_ASSESSMENT"
        ? await tx.reviewCriterionLevel.findMany({ where: { criterionId: { in: criteria.map(c => c.id) } }, orderBy: { position: "asc" } })
        : [];
      const levelsByCrit = new Map<string, typeof levels>();
      for (const lv of levels) levelsByCrit.set(lv.criterionId, [...(levelsByCrit.get(lv.criterionId) ?? []), lv]);
      const validationError = validateTemplateCriteriaConfig(
        draft.reviewMode as AcademicReviewMode,
        criteria.map(c => ({
          key: c.key,
          title: c.label,
          description: c.description ?? undefined,
          required: c.required,
          allowNotApplicable: c.allowNotApplicable,
          weight: c.weight ?? undefined,
          levels: (levelsByCrit.get(c.id) ?? []).map(lv => ({ label: lv.label, description: lv.description ?? undefined, score: lv.score })),
        })),
      );
      if (validationError) throw AppError.badRequest(validationError);
      await tx.reviewTemplateVersion.update({ where: { id: draft.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      await tx.reviewTemplate.update({ where: { id: template.id }, data: { status: "PUBLISHED", activeVersionId: draft.id, version: draft.versionNumber, description: draft.description } });
      return draft;
    });
    await auditService.log("TEMPLATE_VERSION_PUBLISHED", { userId: actor.id, targetTableName: "review_template_versions", targetRecordId: draft.id, details: { templateId: template.id, version: draft.versionNumber } });
    const fresh = await getPrisma().reviewTemplate.findUniqueOrThrow({ where: { id: template.id } });
    return hydrateTemplate(fresh, {
      actorId: actor.id,
      systemRole,
      manageableProjectIds: fresh.projectId ? new Set([fresh.projectId]) : undefined,
    });
  },

  async duplicate(templateInput: string, actorInput: string, systemRole: SystemRole) {
    const source = await this.detail(templateInput, actorInput, systemRole);
    const version = source.activeVersion ?? source.versions[0];
    if (!version) throw AppError.conflict("This template has no copyable version");
    // Strip built-in LumiGap system policy markers so duplicated personal templates
    // are never misclassified as built-in system rubrics (research integrity remains enforced by workflow policy).
    const personalGuidelines = version.guidelines.filter(
      g => !SCIENTIFIC_REVIEW_POLICIES.includes(g as (typeof SCIENTIFIC_REVIEW_POLICIES)[number]),
    );
    const baseName = source.name.replace(/^LumiGap Scientific Manuscript Review Rubric v[\d.]+\s*·\s*/i, "").trim();
    const copyName = `${baseName} (Copy)`.slice(0, 200);
    return this.create({
      name: copyName,
      artifactType: source.artifactType,
      source: "PERSONAL",
      publish: false,
      reviewMode: version.reviewMode,
      description: version.description,
      guidelines: personalGuidelines,
      criteria: version.criteria.map(({ id: _id, order: _order, ...criterion }) => ({
        ...criterion,
        levels: version.reviewMode === "RUBRIC_ASSESSMENT"
          ? criterion.levels.map(({ id: _levelId, position: _position, ...level }) => level)
          : undefined,
      })),
    }, actorInput, systemRole);
  },

  async archive(templateInput: string, actorInput: string, systemRole: SystemRole) {
    const actor = await resolveUser(actorInput);
    const template = await assertManage(templateInput, actor.id, systemRole);
    await getPrisma().reviewTemplate.update({ where: { id: template.id }, data: { status: "ARCHIVED", active: false } });
    await auditService.log("TEMPLATE_ARCHIVED", { userId: actor.id, targetTableName: "review_templates", targetRecordId: template.id });
  },
};

export { hydrateVersion as hydrateReviewTemplateVersion, hydrateTemplate as hydrateReviewTemplateSummary };
