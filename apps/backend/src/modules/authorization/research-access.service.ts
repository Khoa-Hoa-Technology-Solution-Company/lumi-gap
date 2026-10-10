import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";

export async function assertResearchWorkflowAccess(userId: string) {
  const parsed = parseDatabaseId(userId);
  if (!parsed) throw AppError.unauthorized();
  const user = await getPrisma().user.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }, select: { id: true, systemRole: true, accountStatus: true, isActive: true, emailVerifiedAt: true } });
  if (!user?.isActive || user.accountStatus !== "ACTIVE") throw AppError.unauthorized();
  if (user.systemRole === "ADMIN") return;
  if (!user.emailVerifiedAt) throw new AppError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email to use this research workflow", { statusUrl: "/verify-email" });
}
