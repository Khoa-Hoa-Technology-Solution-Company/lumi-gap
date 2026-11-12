import { TECHNICAL_SKILLS, normalizeResearchTerm } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { resolveResearchClassification } from "./research-classification.service.js";
export const researchCatalogService = {
  async search(query: { q: string; level: string; parentId?: string; ids?: string }) {
    const db = getPrisma(), q = normalizeResearchTerm(query.q);
    if (query.level === "skill") return TECHNICAL_SKILLS.filter(skill => [skill.label, skill.id, ...skill.aliases].some(alias => normalizeResearchTerm(alias).includes(q))).map(skill => ({ id: skill.id, name: skill.label, context: skill.kind, source: "LUMIGAP", aliases: [...skill.aliases] }));
    const ids = query.ids?.split(",").filter(id => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)).slice(0, query.level === "keyword" ? 30 : 20);
    if (query.level === "keyword") return (await db.keyword.findMany({ where: { status: "active", ...(ids?.length ? { id: { in: ids } } : q ? { OR: [{ normalizedName: { contains: q, mode: "insensitive" } }, { aliases: { has: q } }] } : {}) }, take: 30, orderBy: [{ paperCount: "desc" }, { id: "asc" }] })).map(keyword => ({ id: keyword.id, name: keyword.keywordName, context: "Keyword", source: keyword.openalexId ? "OPENALEX" : "LOCAL", externalId: keyword.openalexId, aliases: keyword.aliases }));
    const rows = await db.researchTopic.findMany({ where: { status: "active", ...(ids?.length ? { id: { in: ids } } : { level: query.level, ...(query.parentId ? { parentTopicId: query.parentId } : {}), ...(q ? { OR: [{ topicName: { contains: query.q, mode: "insensitive" } }, { labelVi: { contains: query.q, mode: "insensitive" } }, { aliases: { has: q } }] } : {}) }) }, take: 20, orderBy: [{ paperCount: "desc" }, { topicName: "asc" }, { id: "asc" }] });
    const classification = await resolveResearchClassification({ nodeIds: rows.map(row => row.id), keywordIds: [], skillIds: [] });
    return rows.map(row => {
      const path: string[] = [], visited = new Set([row.id]); let parent = row.parentTopicId;
      while (parent && !visited.has(parent) && path.length < 3) { visited.add(parent); const node = classification.nodes.find(node => node.id === parent); if (!node) break; path.unshift(node.name); parent = node.parentId; }
      return { id: row.id, name: row.topicName, labelVi: row.labelVi, context: path.join(" › "), level: row.level, source: row.openalexId ? "OPENALEX" : "LOCAL", externalId: row.openalexId, syncedAt: row.syncedAt?.toISOString(), aliases: row.aliases };
    });
  },
};
