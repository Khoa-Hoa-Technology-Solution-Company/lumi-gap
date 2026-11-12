import type { ResearchClassification, ResearchClassificationInput, TaxonomyLevel } from "@trend/shared-types";
import { RESEARCH_VOCABULARY_VERSION } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../common/exceptions/app-error.js";
import type { Prisma } from "../../generated/prisma/client.js";
type Db = Prisma.TransactionClient;

export async function resolveResearchClassification(input: ResearchClassificationInput, db: Db = getPrisma()): Promise<ResearchClassification> {
  const [selected, keywords] = await Promise.all([
    db.researchTopic.findMany({ where: { id: { in: input.nodeIds }, status: "active" } }),
    db.keyword.findMany({ where: { id: { in: input.keywordIds }, status: "active" } }),
  ]);
  if (selected.length !== input.nodeIds.length || keywords.length !== input.keywordIds.length) throw AppError.badRequest("Research classification changed. Select active catalogue entries again.");
  const nodes = new Map(selected.map(node => [node.id, node]));
  // Preserve hierarchical context and enable cross-disciplinary topic matches without guessing labels.
  for (let depth = 0; depth < 3; depth++) {
    const ids = [...new Set([...nodes.values()].flatMap(node => node.parentTopicId && !nodes.has(node.parentTopicId) ? [node.parentTopicId] : []))];
    if (!ids.length) break;
    const parents = await db.researchTopic.findMany({ where: { id: { in: ids } } });
    parents.forEach(node => nodes.set(node.id, node));
  }
  return { nodeIds: [...input.nodeIds], keywordIds: [...input.keywordIds], skillIds: [...input.skillIds], vocabularyVersion: RESEARCH_VOCABULARY_VERSION,
    nodes: [...nodes.values()].map(node => ({ id: node.id, level: node.level as TaxonomyLevel, name: node.topicName, parentId: node.parentTopicId,
      externalId: node.openalexId, source: node.openalexId ? "OPENALEX" : "LOCAL", aliases: node.aliases, syncedAt: node.syncedAt?.toISOString() ?? null, sourceVersion: node.sourceVersion, labelVi: node.labelVi })),
    keywords: keywords.map(keyword => ({ id: keyword.id, name: keyword.keywordName, aliases: keyword.aliases, source: keyword.openalexId ? "OPENALEX" : "LOCAL", externalId: keyword.openalexId, syncedAt: keyword.syncedAt?.toISOString() ?? null, sourceVersion: keyword.sourceVersion })),
  };
}
export async function validateSupervisionTopics(ids: string[], db: Db = getPrisma()) {
  const value = await resolveResearchClassification({ nodeIds: ids, keywordIds: [], skillIds: [] }, db);
  if (ids.some(id => !value.nodes.some(node => node.id === id && node.level === "topic"))) throw AppError.badRequest("Select research topics for supervision preferences");
  return ids;
}
export function readResearchClassification(value: unknown): ResearchClassification | undefined {
  if (!value || typeof value !== "object" || !("nodes" in value) || !Array.isArray(value.nodes)) return undefined;
  return value as ResearchClassification;
}
