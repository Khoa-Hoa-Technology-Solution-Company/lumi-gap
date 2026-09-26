import { logger } from "../../infrastructure/logger.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";

export interface AuditOptions {
  userId?: string;
  targetTableName?: string;
  targetRecordId?: string;
  details?: unknown;
}

/**
 * Cross-cutting audit logger. Writing an audit row must NEVER break the action
 * being audited, so every call is wrapped in try/catch.
 */
export const auditService = {
  async log(actionName: string, opts: AuditOptions = {}): Promise<void> {
    try {
      let userId: string | null = null;
      if (opts.userId) {
        const parsed = parseDatabaseId(opts.userId);
        if (parsed) {
          const user = await getPrisma().user.findUnique({
            where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
            select: { id: true },
          });
          userId = user?.id ?? null;
        }
      }
      await getPrisma().auditLog.create({
        data: {
          actionName,
          userId,
          targetTableName: opts.targetTableName,
          targetRecordId: opts.targetRecordId,
          details: opts.details === undefined ? undefined : opts.details as never,
        },
      });
    } catch (err) {
      logger.warn({ err, actionName }, "audit log write failed (non-fatal)");
    }
  },
};
