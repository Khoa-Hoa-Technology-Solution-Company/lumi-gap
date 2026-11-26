import { getPrisma } from "../infrastructure/database/prisma.js";

/**
 * Removes the screening workflow rows of test projects so that their project
 * papers and projects can be deleted afterwards. Adding a paper to a project
 * opens a screening round, and every screening table references the project or
 * project paper without ON DELETE CASCADE. Children are deleted before parents.
 *
 * Screening history (reviews, final decisions, audit, legacy records, AI
 * suggestions) is append-only through triggers. Test cleanup bypasses them with
 * a transaction-local `session_replication_role = replica`, which needs the
 * superuser role the CI and local Docker databases use. Never use in app code.
 */
export async function deleteScreeningData(projectIds: Array<string | undefined | null>) {
  const ids = projectIds.filter((id): id is string => Boolean(id));
  if (!ids.length) return;
  const where = { projectId: { in: ids } };
  await getPrisma().$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
    await tx.screeningAdjudicationConflict.deleteMany({ where });
    await tx.screeningAdjudicationStatement.deleteMany({ where });
    await tx.screeningAdjudicationInvitation.deleteMany({ where });
    await tx.screeningAdjudicationCase.deleteMany({ where });
    // Replica mode also skips ON DELETE CASCADE, so obligation events are removed explicitly.
    const obligations = await tx.screeningObligation.findMany({ where, select: { id: true } });
    await tx.screeningObligationEvent.deleteMany({ where: { obligationId: { in: obligations.map((o) => o.id) } } });
    await tx.screeningObligation.deleteMany({ where });
    await tx.screeningAiSuggestion.deleteMany({ where });
    await tx.screeningAudit.deleteMany({ where });
    await tx.screeningReview.deleteMany({ where });
    await tx.screeningFinalDecision.deleteMany({ where });
    await tx.screeningAssignment.deleteMany({ where });
    await tx.screeningRound.deleteMany({ where });
    await tx.screeningLegacyRecord.deleteMany({ where });
    await tx.screeningSettings.deleteMany({ where });
  });
}
