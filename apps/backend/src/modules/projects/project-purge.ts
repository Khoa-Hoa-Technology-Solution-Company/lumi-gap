import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Permanently remove a project whose 30-day Trash retention window has elapsed.
 * Deletes restricted/append-only dependent records in bottom-up topological order
 * inside the caller's transaction, then removes the project row and writes an
 * immutable audit trail entry.
 */
export async function purgeProjectRecord(
  tx: Prisma.TransactionClient,
  projectId: string,
  actorId: string | null,
  details: Prisma.InputJsonObject = {},
) {
  await tx.$executeRawUnsafe(`DELETE FROM "research_integrity_events" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "research_integrity_cases" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "research_evidence_events" WHERE "project_id" = $1::uuid`, projectId);

  // Submissions must precede manuscript_attribution_checks and manuscript_snapshots.
  await tx.$executeRawUnsafe(`DELETE FROM "submissions" WHERE "project_id" = $1::uuid`, projectId);

  await tx.$executeRawUnsafe(`DELETE FROM "manuscript_attribution_decisions" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "manuscript_attribution_checks" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "manuscript_writing_reports" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(
    `DELETE FROM "manuscript_compilations" WHERE "snapshot_id" IN (SELECT "id" FROM "manuscript_snapshots" WHERE "project_id" = $1::uuid)`,
    projectId,
  );
  await tx.$executeRawUnsafe(
    `DELETE FROM "manuscript_snapshot_assets" WHERE "snapshot_id" IN (SELECT "id" FROM "manuscript_snapshots" WHERE "project_id" = $1::uuid)`,
    projectId,
  );
  await tx.$executeRawUnsafe(`DELETE FROM "manuscript_snapshots" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(
    `DELETE FROM "manuscript_updates" WHERE "file_id" IN (SELECT mf."id" FROM "manuscript_files" mf JOIN "draft_workspaces" dw ON dw."id" = mf."workspace_id" WHERE dw."project_id" = $1::uuid)`,
    projectId,
  );
  await tx.$executeRawUnsafe(
    `DELETE FROM "draft_workspaces" SET "main_file_id" = NULL WHERE "project_id" = $1::uuid`
      .replace("DELETE FROM \"draft_workspaces\" SET", "UPDATE \"draft_workspaces\" SET"),
    projectId,
  );
  await tx.$executeRawUnsafe(
    `DELETE FROM "manuscript_files" WHERE "workspace_id" IN (SELECT "id" FROM "draft_workspaces" WHERE "project_id" = $1::uuid)`,
    projectId,
  );
  await tx.$executeRawUnsafe(`DELETE FROM "draft_workspaces" WHERE "project_id" = $1::uuid`, projectId);

  // Collaborative screening v2 + adjudication + obligations
  await tx.$executeRawUnsafe(`DELETE FROM "screening_adjudication_conflicts" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_adjudication_statements" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_adjudication_invitations" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_adjudication_cases" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(
    `DELETE FROM "screening_obligation_events" WHERE "obligation_id" IN (SELECT "id" FROM "screening_obligations" WHERE "project_id" = $1::uuid)`,
    projectId,
  );
  await tx.$executeRawUnsafe(`DELETE FROM "screening_obligations" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_ai_suggestions" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_legacy_records" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_audit" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_final_decisions" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_reviews" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_assignments" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_rounds" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "screening_settings" WHERE "project_id" = $1::uuid`, projectId);

  // Scoped mentor resource access & history
  await tx.$executeRawUnsafe(`DELETE FROM "mentor_access_events" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "mentor_agreements" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`UPDATE "mentor_feedback" SET "reply_to_id" = NULL WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "mentor_feedback" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "mentor_resource_shares" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "mentor_access" WHERE "project_id" = $1::uuid`, projectId);

  // Contribution allocations & workspace revisions (analysis sets)
  await tx.$executeRawUnsafe(`DELETE FROM "allocation_revisions" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "allocation_periods" WHERE "project_id" = $1::uuid`, projectId);
  await tx.$executeRawUnsafe(`DELETE FROM "project_workspace_revisions" WHERE "project_id" = $1::uuid`, projectId);

  await tx.auditLog.create({
    data: {
      userId: actorId,
      actionName: "PROJECT_PERMANENTLY_DELETED",
      targetTableName: "projects",
      targetRecordId: projectId,
      details,
    },
  });

  await tx.project.delete({ where: { id: projectId } });
}
