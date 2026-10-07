import { aiModel } from "../user-ai/user-ai.runtime.js";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { sanitizeForPrompt, UNTRUSTED_DATA_PREAMBLE } from "../llm/grounding.js";
import { sanitizePaperAnalysis, withAnalysisMetadata, type PaperAnalysisContent } from "../papers/paper-ai-analysis.js";
import { chunkPages, digest, normalizeText, RAG_INDEX_VERSION, RELATION_KINDS, sourceFingerprint, validateRelations } from "./knowledge.text.js";
import { loadPaperSource } from "./knowledge.source.js";
import type { GroundedRelation } from "./knowledge.types.js";

export async function indexPaper(paperId: string, force = false) {
  const prisma = getPrisma();
  const paper = await prisma.paper.findUniqueOrThrow({ where: { id: paperId } });
  if (paper.dataStatus !== "active") throw new Error("Only approved active papers can be indexed in the shared corpus");
  const sourceHash = sourceFingerprint(paper);
  const existing = await prisma.paperDocument.findUnique({ where: { paperId } });
  if (!force && existing?.status === "ready" && existing.sourceHash === sourceHash && existing.indexVersion === RAG_INDEX_VERSION) return paper.aiAnalysis;
  const indexingToken = randomUUID();
  const document = await prisma.$transaction(async (tx) => {
    const locks = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`rag:${paperId}`}, 0)) AS locked`;
    if (!locks[0]?.locked) throw new Error("Paper indexing is already being claimed");
    const latest = await tx.paperDocument.findUnique({ where: { paperId } });
    if (latest?.status === "processing" && latest.updatedAt.getTime() > Date.now() - 30 * 60 * 1000) throw new Error("Paper indexing is already running");
    return tx.paperDocument.upsert({
      where: { paperId }, create: { paperId, sourceHash, indexingToken, status: "processing" },
      update: { sourceHash, indexingToken, status: "processing", errorMessage: null },
    });
  });
  try {
    const source = await loadPaperSource(paper);
    const chunks = chunkPages(source.pages, env.RAG_CHUNK_CHARS, env.RAG_MAX_CHUNKS);
    const contentHash = digest(JSON.stringify(chunks.map((chunk) => [chunk.pageNumber, chunk.text])));
    const analyses: PaperAnalysisContent[] = [];
    const relations: GroundedRelation[] = [];
    const vectors: number[][] = [];
    const provider = getEmbeddingProvider();
    if (provider.dimensions !== 768) throw new Error("RAG requires a 768-dimensional embedding provider");
    for (let offset = 0; offset < chunks.length; offset += 8) {
      const batch = chunks.slice(offset, offset + 8);
      const result = await cachedGenerateJSON<{ analysis: PaperAnalysisContent; relations: GroundedRelation[] }>({
        task: "extract", promptVersion: RAG_INDEX_VERSION,
        keyParts: { paperId, contentHash, positions: batch.map((chunk) => chunk.position) },
        model: aiModel(),
        prompt: [
          `Paper title: ${sanitizeForPrompt(paper.title)}`,
          `Source coverage: ${source.sourceKind}`,
          "Extract summary, methods, dataset, findings[], limitations[], contributions[], futureWork[], keyTerms[] from ONLY the passages. Missing scalars=null, missing lists=[].",
          `Return JSON {analysis: {...}, relations: [{kind, name, quote, chunkPosition}]}. Allowed kinds: ${RELATION_KINDS.join(", ")}.`,
          "Every relation must have an exact verbatim quote (12-1000 characters) from its chunk. Do not infer results, missing experiments, or future work. Entity name is a concise label for the quoted fact. Max 24 relations.",
          ...batch.map((chunk) => `<<<PASSAGE_${chunk.position} page=${chunk.pageNumber ?? "abstract"}>>>\n${sanitizeForPrompt(chunk.text)}\n<<<END_PASSAGE_${chunk.position}>>>`),
        ].join("\n\n"),
        validate: (raw) => {
          if (!raw || typeof raw !== "object" || !("analysis" in raw)) throw new Error("Invalid knowledge extraction output");
          const analysis = sanitizePaperAnalysis(raw.analysis);
          if (!analysis.summary && !analysis.methods && !analysis.dataset && !analysis.findings.length && !analysis.limitations.length && !analysis.keyTerms.length && !analysis.contributions.length && !analysis.futureWork.length) throw new Error("Knowledge extraction returned no content");
          return { analysis, relations: validateRelations(raw.relations, batch) };
        },
        options: { system: `Extract grounded scientific knowledge. ${UNTRUSTED_DATA_PREAMBLE}`, temperature: 0, maxOutputTokens: Math.max(env.PAPER_ANALYSIS_MAX_OUTPUT_TOKENS, 4096) },
      });
      analyses.push(result.analysis); relations.push(...result.relations);
      const embedded = await provider.embedBatch(batch.map((chunk) => chunk.text));
      if (embedded.length !== batch.length || embedded.some((vector) => vector.length !== 768 || vector.some((n) => !Number.isFinite(n)))) throw new Error("Invalid passage embeddings");
      vectors.push(...embedded);
      const heartbeat = await prisma.paperDocument.updateMany({ where: { id: document.id, indexingToken, status: "processing" }, data: { updatedAt: new Date() } });
      if (!heartbeat.count) throw new Error("Paper index lease was superseded by a source update or another job");
    }
    const merged = mergeAnalyses(analyses);
    const aiAnalysis = { ...withAnalysisMetadata(merged), sourceKind: source.sourceKind, contentHash, analysisPromptVersion: RAG_INDEX_VERSION, warnings: source.warnings };
    await prisma.$transaction(async (tx) => {
      // Lock the paper before comparing, so edits cannot race publication of an old index.
      await tx.$queryRaw`SELECT id FROM papers WHERE id = ${paperId}::uuid FOR UPDATE`;
      const current = await tx.paper.findUniqueOrThrow({ where: { id: paperId } });
      if (current.dataStatus !== "active" || sourceFingerprint(current) !== sourceHash) throw new Error("Paper source changed during indexing; retry with the current source");
      const lease = await tx.paperDocument.findUniqueOrThrow({ where: { id: document.id } });
      if (lease.indexingToken !== indexingToken) throw new Error("Paper index lease was superseded");
      await tx.paperChunk.deleteMany({ where: { documentId: document.id } });
      for (const chunk of chunks) {
        const id = randomUUID();
        const vector = `[${vectors[chunk.position]!.join(",")}]`;
        await tx.$executeRaw`INSERT INTO paper_chunks (id, document_id, position, page_number, text, content_hash, embedding)
          VALUES (${id}::uuid, ${document.id}::uuid, ${chunk.position}, ${chunk.pageNumber}, ${chunk.text}, ${chunk.contentHash}, ${vector}::vector)`;
        for (const relation of relations.filter((row) => row.chunkPosition === chunk.position)) {
          const normalizedName = normalizeText(relation.name).toLowerCase();
          const entity = await tx.knowledgeEntity.upsert({ where: { kind_normalizedName: { kind: relation.kind, normalizedName } }, create: { kind: relation.kind, normalizedName, name: relation.name }, update: {} });
          await tx.knowledgeRelation.create({ data: { chunkId: id, entityId: entity.id, kind: relation.kind, quote: relation.quote } });
        }
      }
      await tx.paper.update({ where: { id: paperId }, data: { aiAnalysis: aiAnalysis as never } });
      await tx.paperDocument.update({ where: { id: document.id }, data: { status: "ready", indexingToken: null, sourceKind: source.sourceKind, contentHash, sourceHash, indexVersion: RAG_INDEX_VERSION, pageCount: source.pageCount, warnings: source.warnings, indexedAt: new Date(), errorMessage: null } });
    }, { timeout: 60000 });
    return aiAnalysis;
  } catch (error) {
    await prisma.paperDocument.updateMany({ where: { id: document.id, sourceHash, indexingToken }, data: { status: "failed", indexingToken: null, errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Indexing failed" } });
    throw error;
  }
}

export function mergeAnalyses(items: PaperAnalysisContent[]): PaperAnalysisContent {
  const list = (key: "findings" | "limitations" | "contributions" | "futureWork" | "keyTerms") => [...new Set(items.flatMap((item) => item[key]))].slice(0, 32);
  const scalar = (key: "summary" | "methods" | "dataset") => [...new Set(items.flatMap((item) => item[key] ? [item[key]!] : []))].join("; ").slice(0, 4000) || null;
  return { summary: scalar("summary"), methods: scalar("methods"), dataset: scalar("dataset"), findings: list("findings"), limitations: list("limitations"), contributions: list("contributions"), futureWork: list("futureWork"), keyTerms: list("keyTerms") };
}
