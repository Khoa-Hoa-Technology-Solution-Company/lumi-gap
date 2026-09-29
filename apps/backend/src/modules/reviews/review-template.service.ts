import type {
  AcademicReviewMode,
  CreateReviewTemplateInput,
  ReviewTemplateVersionInput,
  SystemRole,
} from "@trend/shared-types";
import { isAdminSystemRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { auditService } from "../audit/audit.service.js";
import { nextTemplateVersionNumber } from "./academic-review.rules.js";

function whereId(value: string): { id?: string; legacyMongoId?: string } {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

function clean(value: string | undefined): string | undefined {
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
  const project = await getPrisma().project.findUnique({ where: { id: projectId }, select: { ownerId: true, status: true } });
  return Boolean(project && project.ownerId === userId && project.status !== "ARCHIVED");
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
  const criteria = await prisma.reviewCriterion.findMany({ where: { versionId }, orderBy: { order: "asc" } });
  const levels = await prisma.reviewCriterionLevel.findMany({
    where: { criterionId: { in: criteria.map((item) => item.id) } },
    orderBy: [{ criterionId: "asc" }, { position: "asc" }],
  });
  const levelMap = new Map<string, typeof levels>();
  for (const level of levels) levelMap.set(level.criterionId, [...(levelMap.get(level.criterionId) ?? []), level]);
  return {
    id: publicDatabaseId(version),
    versionNumber: version.versionNumber,
    reviewMode: version.reviewMode,
    description: version.description ?? undefined,
    guidelines: version.guidelines,
    status: version.status,
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

async function hydrateTemplate(template: Awaited<ReturnType<typeof getPrisma>>["reviewTemplate"] extends never ? never : any) {
  return {
    id: publicDatabaseId(template), name: template.name, description: template.description ?? undefined,
    source: template.source, artifactType: template.artifactType ?? template.submissionType ?? undefined,
    status: template.status, ownerId: template.ownerId ?? undefined, projectId: template.projectId ?? undefined,
    activeVersion: template.activeVersionId ? await hydrateVersion(template.activeVersionId) : undefined,
    updatedAt: template.updatedAt,
  };
}

async function replaceCriteria(versionId: string, templateId: string, input: ReviewTemplateVersionInput) {
  const prisma = getPrisma();
  await prisma.reviewCriterion.deleteMany({ where: { versionId } });
  for (const [index, item] of input.criteria.entries()) {
    const criterion = await prisma.reviewCriterion.create({
      data: {
        templateId, versionId, key: clean(item.key) ?? criterionKey(item.title, index), label: clean(item.title)!,
        description: clean(item.description), weight: item.weight, order: index,
        required: item.required, allowNotApplicable: item.allowNotApplicable,
      },
    });
    if (item.levels?.length) {
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
  async list(actorInput: string) {
    const actor = await resolveUser(actorInput);
    const memberships = await getPrisma().projectMember.findMany({
      where: { userId: actor.id, status: "ACTIVE" }, select: { projectId: true },
    });
    const owned = await getPrisma().project.findMany({ where: { ownerId: actor.id }, select: { id: true } });
    const projectIds = [...new Set([...memberships.map((item) => item.projectId), ...owned.map((item) => item.id)])];
    const rows = await getPrisma().reviewTemplate.findMany({
      where: {
        active: true,
        OR: [
          { source: "SYSTEM", status: "PUBLISHED" },
          { source: "PERSONAL", ownerId: actor.id },
          ...(projectIds.length ? [{ source: "PROJECT", projectId: { in: projectIds } }] : []),
        ],
      },
      orderBy: [{ source: "asc" }, { name: "asc" }],
    });
    return Promise.all(rows.map(hydrateTemplate));
  },

  async detail(templateInput: string, actorInput: string) {
    const actor = await resolveUser(actorInput);
    const visible = await this.list(actor.id);
    const id = publicDatabaseId(await getPrisma().reviewTemplate.findFirst({ where: whereId(templateInput) }) ?? { id: "" });
    const summary = visible.find((item) => item.id === id);
    if (!summary) throw AppError.notFound("Review template not found");
    const versions = await getPrisma().reviewTemplateVersion.findMany({
      where: { templateId: (await getPrisma().reviewTemplate.findFirstOrThrow({ where: whereId(templateInput) })).id },
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
    const status = input.publish ? "PUBLISHED" : "DRAFT";
    const created = await getPrisma().$transaction(async (tx) => {
      const template = await tx.reviewTemplate.create({ data: {
        name: clean(input.name)!, description: clean(input.description), submissionType: input.artifactType,
        artifactType: input.artifactType, source: input.source,
        projectId: input.source === "PROJECT" ? input.projectId : undefined,
        ownerId: input.source === "SYSTEM" ? undefined : actor.id, status, active: true,
      } });
      const version = await tx.reviewTemplateVersion.create({ data: {
        templateId: template.id, versionNumber: 1, reviewMode: input.reviewMode,
        description: clean(input.description), guidelines: input.guidelines.map((item) => clean(item)!).filter(Boolean),
        status, createdById: actor.id, publishedAt: input.publish ? new Date() : undefined,
      } });
      await tx.reviewTemplate.update({ where: { id: template.id }, data: { activeVersionId: version.id } });
      return { template, version };
    });
    await replaceCriteria(created.version.id, created.template.id, input);
    await auditService.log("TEMPLATE_CREATED", {
      userId: actor.id, targetTableName: "review_templates", targetRecordId: created.template.id,
      details: { source: input.source, reviewMode: input.reviewMode, version: 1 },
    });
    if (input.publish) await auditService.log("TEMPLATE_VERSION_PUBLISHED", {
      userId: actor.id, targetTableName: "review_template_versions", targetRecordId: created.version.id,
      details: { templateId: created.template.id, version: 1 },
    });
    return hydrateTemplate(await getPrisma().reviewTemplate.findUniqueOrThrow({ where: { id: created.template.id } }));
  },

  async saveVersion(templateInput: string, input: ReviewTemplateVersionInput, actorInput: string, systemRole: SystemRole) {
    const actor = await resolveUser(actorInput);
    const template = await assertManage(templateInput, actor.id, systemRole);
    const versions = await getPrisma().reviewTemplateVersion.findMany({ where: { templateId: template.id }, orderBy: { versionNumber: "desc" } });
    let draft = versions.find((item) => item.status === "DRAFT");
    if (!draft) draft = await getPrisma().reviewTemplateVersion.create({ data: {
      templateId: template.id, versionNumber: nextTemplateVersionNumber(versions),
      reviewMode: input.reviewMode, description: clean(input.description), guidelines: input.guidelines,
      status: "DRAFT", createdById: actor.id,
    } });
    else draft = await getPrisma().reviewTemplateVersion.update({ where: { id: draft.id }, data: {
      reviewMode: input.reviewMode, description: clean(input.description), guidelines: input.guidelines,
    } });
    await replaceCriteria(draft.id, template.id, input);
    await getPrisma().reviewTemplate.update({ where: { id: template.id }, data: { status: "DRAFT", description: clean(input.description) } });
    return hydrateVersion(draft.id);
  },

  async publish(templateInput: string, actorInput: string, systemRole: SystemRole) {
    const actor = await resolveUser(actorInput);
    const template = await assertManage(templateInput, actor.id, systemRole);
    const draft = await getPrisma().reviewTemplateVersion.findFirst({ where: { templateId: template.id, status: "DRAFT" }, orderBy: { versionNumber: "desc" } });
    if (!draft) throw AppError.conflict("This template has no draft version to publish");
    const criteriaCount = await getPrisma().reviewCriterion.count({ where: { versionId: draft.id } });
    if (!criteriaCount) throw AppError.badRequest("A template requires at least one criterion");
    await getPrisma().$transaction([
      getPrisma().reviewTemplateVersion.update({ where: { id: draft.id }, data: { status: "PUBLISHED", publishedAt: new Date() } }),
      getPrisma().reviewTemplate.update({ where: { id: template.id }, data: { status: "PUBLISHED", activeVersionId: draft.id, version: draft.versionNumber } }),
    ]);
    await auditService.log("TEMPLATE_VERSION_PUBLISHED", { userId: actor.id, targetTableName: "review_template_versions", targetRecordId: draft.id, details: { templateId: template.id, version: draft.versionNumber } });
    return hydrateTemplate(await getPrisma().reviewTemplate.findUniqueOrThrow({ where: { id: template.id } }));
  },

  async duplicate(templateInput: string, actorInput: string, systemRole: SystemRole) {
    const source = await this.detail(templateInput, actorInput);
    const version = source.activeVersion;
    if (!version) throw AppError.conflict("This template has no active version");
    return this.create({
      name: `${source.name} copy`, artifactType: source.artifactType, source: "PERSONAL", publish: false,
      reviewMode: version.reviewMode as AcademicReviewMode, description: version.description, guidelines: version.guidelines,
      criteria: version.criteria.map(({ id: _id, order: _order, ...criterion }) => ({ ...criterion, levels: criterion.levels.map(({ id: _levelId, position: _position, ...level }) => level) })),
    }, actorInput, systemRole);
  },

  async archive(templateInput: string, actorInput: string, systemRole: SystemRole) {
    const actor = await resolveUser(actorInput);
    const template = await assertManage(templateInput, actor.id, systemRole);
    await getPrisma().reviewTemplate.update({ where: { id: template.id }, data: { status: "ARCHIVED", active: false } });
    await auditService.log("TEMPLATE_ARCHIVED", { userId: actor.id, targetTableName: "review_templates", targetRecordId: template.id });
  },
};

export { hydrateVersion as hydrateReviewTemplateVersion };
