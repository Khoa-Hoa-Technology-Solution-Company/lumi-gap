export interface PaperKnowledgeEvidence {
  sourceKind: string;
  contentHash: string;
  warnings: string[];
  passages: Array<{ id: string; pageNumber: number | null; text: string; relations: string[] }>;
}

export interface PaperEvidenceSnapshot {
  id: string;
  title: string;
  abstractText?: string;
  knowledgeEvidence?: PaperKnowledgeEvidence;
}

export interface PaperKnowledge {
  paperId: string;
  status: "not_indexed" | "queued" | "processing" | "ready" | "failed" | "outdated";
  sourceKind?: string;
  pageCount?: number;
  chunkCount?: number;
  indexedAt?: string;
  warnings: string[];
  errorMessage?: string;
  nodes: Array<{ id: string; kind: string; name: string }>;
  edges: Array<{ id: string; targetId: string; kind: string; quote: string; chunkId: string; pageNumber: number | null }>;
  passages: Array<{ id: string; pageNumber: number | null; text: string }>;
}
