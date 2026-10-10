import type {
  AcademicIdentityConnectionMethod,
  AcademicIdentityLink,
  AcademicIdentityProvider,
  AcademicIdentityStatus,
  AcademicIdentityVisibility,
  AcademicIdentityVerificationStatus,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import {
  AcademicIdentityLinkSchema,
  type CreateAcademicIdentityLinkInput,
  type UpdateAcademicIdentityLinkInput,
} from "./dto/academic-profile.schema.js";

const ACADEMIC_PROVIDERS = new Set<AcademicIdentityProvider>([
  "ORCID", "OPENALEX", "GOOGLE_SCHOLAR", "SEMANTIC_SCHOLAR", "OTHER",
]);

type IdentityRow = {
  id: string;
  userId: string;
  provider: AcademicIdentityProvider;
  label: string | null;
  identifier: string | null;
  profileUrl: string | null;
  connectionMethod: AcademicIdentityConnectionMethod;
  status: AcademicIdentityStatus;
  verificationStatus: AcademicIdentityVerificationStatus;
  visibility: AcademicIdentityVisibility;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeLabel(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw AppError.badRequest("Profile URL must be a valid HTTP or HTTPS URL");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw AppError.badRequest("Profile URL must use HTTP or HTTPS without embedded credentials");
  }
  return url.toString();
}

function normalizeIdentifier(provider: AcademicIdentityProvider, value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw AppError.badRequest("Academic identity identifiers cannot use unsupported URL schemes");
  }
  if (provider === "ORCID") return trimmed.replace(/^https?:\/\/orcid\.org\//i, "").replace(/\/$/, "").toUpperCase();
  if (provider === "OPENALEX") return trimmed.replace(/^https?:\/\/openalex\.org\//i, "").replace(/\/$/, "").toUpperCase();
  return trimmed;
}

function normalizeInput(input: CreateAcademicIdentityLinkInput): CreateAcademicIdentityLinkInput {
  const provider = input.provider as AcademicIdentityProvider;
  if (!ACADEMIC_PROVIDERS.has(provider)) throw AppError.badRequest("Unsupported academic identity provider");
  const normalized = {
    provider,
    label: sanitizeLabel(input.label),
    identifier: normalizeIdentifier(provider, input.identifier),
    profileUrl: normalizeUrl(input.profileUrl),
    visibility: input.visibility ?? "PUBLIC",
  } satisfies CreateAcademicIdentityLinkInput;
  const parsed = AcademicIdentityLinkSchema.safeParse(normalized);
  if (!parsed.success) throw AppError.badRequest("Invalid academic identity", parsed.error.flatten());
  return parsed.data;
}

export function mapAcademicIdentity(row: IdentityRow): AcademicIdentityLink {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label ?? undefined,
    identifier: row.identifier ?? undefined,
    profileUrl: row.profileUrl ?? undefined,
    connectionMethod: row.connectionMethod,
    status: row.status,
    verificationStatus: row.verificationStatus,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveUser(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.notFound("Academic identity owner not found");
  const user = await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
    select: { id: true, accountStatus: true },
  });
  if (!user || user.accountStatus !== "ACTIVE") throw AppError.notFound("Academic identity owner not found");
  return user;
}

async function ownedIdentity(userId: string, identityId: string) {
  const user = await resolveUser(userId);
  const parsed = parseDatabaseId(identityId);
  if (!parsed || parsed.kind !== "uuid") throw AppError.notFound("Academic identity not found");
  const identity = await getPrisma().academicIdentityLink.findUnique({ where: { id: parsed.value } }) as IdentityRow | null;
  if (!identity || identity.userId !== user.id) throw AppError.notFound("Academic identity not found");
  return { user, identity };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}

export const academicIdentityService = {
  async list(userId: string): Promise<AcademicIdentityLink[]> {
    const user = await resolveUser(userId);
    const rows = await getPrisma().academicIdentityLink.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) as IdentityRow[];
    return rows.map(mapAcademicIdentity);
  },

  async create(userId: string, input: CreateAcademicIdentityLinkInput): Promise<AcademicIdentityLink> {
    const user = await resolveUser(userId);
    const normalized = normalizeInput(input);
    const existing = await getPrisma().academicIdentityLink.findFirst({
      where: {
        userId: user.id,
        provider: normalized.provider,
        ...(normalized.provider === "ORCID" ? {} : { OR: [
          ...(normalized.identifier ? [{ identifier: normalized.identifier }] : []),
          ...(normalized.profileUrl ? [{ profileUrl: normalized.profileUrl }] : []),
        ] }),
      },
    });
    if (existing) throw AppError.conflict("This academic identity is already linked");
    try {
      const created = await getPrisma().academicIdentityLink.create({
        data: {
          userId: user.id,
          provider: normalized.provider,
          label: normalized.label,
          identifier: normalized.identifier,
          profileUrl: normalized.profileUrl,
          connectionMethod: "MANUAL",
          status: "SELF_DECLARED",
          verificationStatus: "UNVERIFIED",
          visibility: normalized.visibility,
        },
      }) as IdentityRow;
      await auditService.log("academic_profile.identity.created", { userId: user.id, targetTableName: "academic_identity_links", targetRecordId: created.id, details: { provider: created.provider } });
      return mapAcademicIdentity(created);
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict("This academic identity is already linked");
      throw error;
    }
  },

  async update(userId: string, identityId: string, input: UpdateAcademicIdentityLinkInput): Promise<AcademicIdentityLink> {
    const { user, identity } = await ownedIdentity(userId, identityId);
    const hasField = (field: keyof UpdateAcademicIdentityLinkInput) => Object.prototype.hasOwnProperty.call(input, field);
    const merged = {
      provider: input.provider ?? identity.provider,
      label: hasField("label") ? input.label : identity.label ?? undefined,
      identifier: hasField("identifier") ? input.identifier ?? undefined : identity.identifier ?? undefined,
      profileUrl: hasField("profileUrl") ? input.profileUrl ?? undefined : identity.profileUrl ?? undefined,
      visibility: input.visibility ?? identity.visibility,
    } satisfies CreateAcademicIdentityLinkInput;
    const normalized = normalizeInput(merged);
    const changedValue = normalized.provider !== identity.provider
      || normalized.identifier !== (identity.identifier ?? undefined)
      || normalized.profileUrl !== (identity.profileUrl ?? undefined);
    if (changedValue && identity.verificationStatus === "PROVIDER_CONNECTED") {
      throw AppError.badRequest("Disconnect the provider before changing this academic identity");
    }
    const duplicate = await getPrisma().academicIdentityLink.findFirst({
      where: {
        userId: user.id,
        provider: normalized.provider,
        id: { not: identity.id },
        ...(normalized.provider === "ORCID" ? {} : { OR: [
          ...(normalized.identifier ? [{ identifier: normalized.identifier }] : []),
          ...(normalized.profileUrl ? [{ profileUrl: normalized.profileUrl }] : []),
        ] }),
      },
    });
    if (duplicate) throw AppError.conflict("This academic identity is already linked");
    try {
      const updated = await getPrisma().academicIdentityLink.update({
        where: { id: identity.id },
        data: {
          provider: normalized.provider,
          label: normalized.label,
          identifier: normalized.identifier ?? null,
          profileUrl: normalized.profileUrl ?? null,
          visibility: normalized.visibility,
          ...(changedValue ? { connectionMethod: "MANUAL", status: "SELF_DECLARED", verificationStatus: "UNVERIFIED" } : {}),
        },
      }) as IdentityRow;
      await auditService.log("academic_profile.identity.updated", { userId: user.id, targetTableName: "academic_identity_links", targetRecordId: updated.id, details: { provider: updated.provider, valueChanged: changedValue } });
      return mapAcademicIdentity(updated);
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict("This academic identity is already linked");
      throw error;
    }
  },

  async remove(userId: string, identityId: string): Promise<void> {
    const { user, identity } = await ownedIdentity(userId, identityId);
    await getPrisma().academicIdentityLink.delete({ where: { id: identity.id } });
    await auditService.log("academic_profile.identity.deleted", { userId: user.id, targetTableName: "academic_identity_links", targetRecordId: identity.id, details: { provider: identity.provider } });
  },
};

export function visibleAcademicIdentityLinks(links: AcademicIdentityLink[], viewerId: string | undefined, ownerId: string): AcademicIdentityLink[] {
  if (viewerId === ownerId) return links;
  return links.filter((link) => link.visibility === "PUBLIC" || link.visibility === "REGISTERED_USERS" && Boolean(viewerId));
}
