import { sanitizeForPrompt } from "../llm/grounding.js";

export interface PaperStructuredAnalysis {
  summary?: string | null;
  methods?: string | null;
  dataset?: string | null;
  findings?: string[];
  limitations?: string[];
  contributions?: string[];
  futureWork?: string[];
  keyTerms?: string[];
}

const MAX_FIELD_CHARS = 500;
const MAX_LIST_ITEMS = 4;

export function buildStructuredPaperContext(
  aiAnalysis: PaperStructuredAnalysis | null | undefined,
): string | null {
  if (!aiAnalysis) return null;

  const lines: string[] = [];
  addScalar(lines, "Summary", aiAnalysis.summary);
  addScalar(lines, "Methods", aiAnalysis.methods);
  addScalar(lines, "Dataset", aiAnalysis.dataset);
  addList(lines, "Findings", aiAnalysis.findings);
  addList(lines, "Limitations", aiAnalysis.limitations);
  addList(lines, "Contributions", aiAnalysis.contributions);
  addList(lines, "Future work", aiAnalysis.futureWork);
  addList(lines, "Key terms", aiAnalysis.keyTerms);

  if (lines.length === 0) return null;
  return ["Structured analysis:", ...lines].join("\n");
}

export function buildPaperEvidenceText(input: {
  abstractText?: string;
  aiAnalysis?: PaperStructuredAnalysis | null;
}): string {
  const structured = buildStructuredPaperContext(input.aiAnalysis);
  const abstractText = sanitizeForPrompt(input.abstractText || "(no abstract)");
  if (!structured) return abstractText;
  return `${structured}\n\nAbstract: ${abstractText}`;
}

function addScalar(lines: string[], label: string, value: string | null | undefined): void {
  const text = clean(value);
  if (text) lines.push(`${label}: ${text}`);
}

function addList(lines: string[], label: string, values: string[] | undefined): void {
  const items = (values ?? []).map(clean).filter(Boolean).slice(0, MAX_LIST_ITEMS);
  if (items.length > 0) lines.push(`${label}: ${items.join("; ")}`);
}

function clean(value: unknown): string {
  return sanitizeForPrompt(value).slice(0, MAX_FIELD_CHARS).trim();
}
