/** Word units are thousandths of a word, split by character ownership inside mixed words. */
export interface ManuscriptWritingCalculation {
  algorithmVersion: "RETAINED_WRITING_V1";
  totalWords: number;
  attributedWordUnits: number;
  unknownWordUnits: number;
  coverageBasisPoints: number;
  recordedFrom?: string | null;
  recordedThrough?: string | null;
  members: { userId: string; name: string; retainedWordUnits: number; overallBasisPoints: number; suggestedBasisPoints: number | null }[];
  files: { id: string; path: string; totalWords: number; unknownWordUnits: number }[];
}
export interface ManuscriptWritingReport {
  id: string; manuscriptId: string; snapshotId: string; snapshotLabel: string; title: string;
  sourceVersion: number; status: "QUEUED" | "COMPLETED" | "FAILED";
  createdAt: string; calculatedAt: string | null; inputHash: string | null;
  isStale: boolean; result: ManuscriptWritingCalculation | null;
}
export interface ManuscriptWritingReference {
  reportId: string; snapshotId: string; inputHash: string; algorithmVersion: "RETAINED_WRITING_V1";
  coverageBasisPoints: number;
  recordedFrom: string;
  recordedThrough: string;
  suggestedParticipation: { userId: string; basisPoints: number }[];
}
