import "../src/config/load-env.js";
import { z } from "zod";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { normalizedInstitutionHost } from "../src/modules/identity/institution-domain.service.js";
import { auditService } from "../src/modules/audit/audit.service.js";

// Operations command, after independently checking institution control.
const [adminId, institutionId, inputDomain, type, subdomains = "false"] = process.argv.slice(2);
const input = z.object({ adminId: z.string().uuid(), institutionId: z.string().uuid(), domain: z.string(), type: z.enum(["EMAIL", "WEBSITE", "BOTH"]), subdomains: z.enum(["true", "false"]) }).parse({ adminId, institutionId, domain: inputDomain, type, subdomains });
try {
  const db = getPrisma(), domain = normalizedInstitutionHost(input.domain);
  if (!domain) throw new Error("Use a public DNS hostname without scheme/path/port");
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.adminId}::uuid FOR UPDATE`;
    const admin = await tx.user.findUnique({ where: { id: input.adminId } });
    const institution = await tx.institution.findUnique({ where: { id: input.institutionId } });
    if (!admin?.isActive || admin.accountStatus !== "ACTIVE" || admin.systemRole !== "ADMIN") throw new Error("An active Administrator is required");
    if (!institution?.isActive || institution.status !== "ACTIVE") throw new Error("An active institution is required");
    const existing = await tx.institutionDomain.findUnique({ where: { domain } });
    if (existing && existing.institutionId !== institution.id) throw new Error("Domain belongs to another institution; resolve ownership first");
    const data = { type: input.type, trusted: true, status: "ACTIVE", allowSubdomains: input.subdomains === "true", verifiedAt: new Date(), verificationMethod: "ADMIN_REVIEW" };
    await tx.institutionDomain.upsert({ where: { domain }, create: { institutionId: institution.id, domain, ...data }, update: data });
  });
  await auditService.log("INSTITUTION_DOMAIN_APPROVED", { userId: input.adminId, targetTableName: "institutions", targetRecordId: input.institutionId, details: { domain, type: input.type, allowSubdomains: input.subdomains === "true" } });
  console.log("Institution domain approved");
} finally { await disconnectPostgres(); }
