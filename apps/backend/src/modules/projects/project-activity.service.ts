import type { ProjectActivityType } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";

export interface RecordProjectActivityInput {
  projectId: string;
  actorId?: string;
  type: ProjectActivityType;
  entityKind?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export const projectActivityService = {
  async record(input: RecordProjectActivityInput) {
    return getPrisma().projectActivity.create({
      data: {
        projectId: input.projectId,
        actorId: input.actorId,
        type: input.type,
        entityKind: input.entityKind,
        entityId: input.entityId,
        metadata: (input.metadata ?? {}) as never,
      },
    });
  },

  async list(projectId: string, limit = 50) {
    const rows = await getPrisma().projectActivity.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const actorIds = [...new Set(rows.flatMap((row) => row.actorId ? [row.actorId] : []))];
    const actors = actorIds.length
      ? await getPrisma().user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true },
        })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, {
      _id: publicDatabaseId(actor),
      fullName: actor.fullName,
      avatarUrl: actor.avatarUrl ?? undefined,
    }]));
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      actor: row.actorId ? actorById.get(row.actorId) : undefined,
      entityKind: row.entityKind ?? undefined,
      entityId: row.entityId ?? undefined,
      metadata: row.metadata as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    }));
  },
};
