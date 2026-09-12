import { logger } from "../../infrastructure/logger.js";
import { AuditLogModel } from "./models/audit-log.model.js";

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
      await AuditLogModel.create({
        actionName,
        userId: opts.userId,
        targetTableName: opts.targetTableName,
        targetRecordId: opts.targetRecordId,
        detailsText: opts.details,
      });
    } catch (err) {
      logger.warn({ err, actionName }, "audit log write failed (non-fatal)");
    }
  },
};
