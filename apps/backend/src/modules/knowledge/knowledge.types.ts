export interface SourcePage { pageNumber: number | null; text: string }
export interface SourceChunk { position: number; pageNumber: number | null; text: string; contentHash: string }
export interface GroundedRelation { kind: string; name: string; quote: string; chunkPosition: number }
export interface PassageEvidence { id: string; pageNumber: number | null; text: string; relations: string[] }
export type KnowledgeEvidence = import("@trend/shared-types").PaperKnowledgeEvidence;
