import crypto from "node:crypto";

export const PROJECT_CHAT_PROMPT_VERSION = "project-chat-v1";

export interface BudgetPaper {
  id: string;
  title: string;
  abstractText?: string;
  score?: number;
}

export interface BudgetHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface FitToBudgetInput<TPaper extends BudgetPaper> {
  papers: TPaper[];
  history: BudgetHistoryTurn[];
  maxChars: number;
  abstractMaxChars: number;
  render: (papers: TPaper[], history: BudgetHistoryTurn[]) => string;
}

export interface FitToBudgetResult<TPaper extends BudgetPaper> {
  papers: TPaper[];
  history: BudgetHistoryTurn[];
  truncatedAbstracts: number;
  droppedPapers: number;
  droppedHistoryTurns: number;
}

export interface BuildChatCacheKeyInput {
  projectId: string;
  scope: "private" | "team";
  question: string;
  paperIds: string[];
  promptVersion: string;
  provider: string;
  model: string;
}

export function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildChatCacheKey(input: BuildChatCacheKeyInput): string {
  const canonical = JSON.stringify({
    projectId: input.projectId,
    scope: input.scope,
    question: normalizeQuestion(input.question),
    paperIds: [...input.paperIds].sort(),
    promptVersion: input.promptVersion,
    provider: input.provider,
    model: input.model,
  });
  return `project-chat:${crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 40)}`;
}

export function truncateAbstract(text: string | undefined, maxChars: number): string | undefined {
  if (!text) return text;
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}

export function fitToBudget<TPaper extends BudgetPaper>(
  input: FitToBudgetInput<TPaper>,
): FitToBudgetResult<TPaper> {
  let papers = input.papers.map((paper) => ({
    ...paper,
    abstractText: truncateAbstract(paper.abstractText, input.abstractMaxChars),
  }));
  let history = [...input.history];
  let truncatedAbstracts = 0;
  let droppedPapers = 0;
  let droppedHistoryTurns = 0;

  const overBudget = () => input.render(papers, history).length > input.maxChars;

  while (overBudget()) {
    const candidate = papers
      .map((paper, index) => ({ paper, index }))
      .filter(({ paper }) => (paper.abstractText?.length ?? 0) > 160)
      .sort((a, b) => scoreAsc(a.paper, a.index, b.paper, b.index))[0];

    if (!candidate) break;
    const current = candidate.paper.abstractText ?? "";
    const nextMax = Math.max(160, Math.floor(current.length / 2));
    papers[candidate.index] = {
      ...candidate.paper,
      abstractText: truncateAbstract(current, nextMax),
    };
    truncatedAbstracts += 1;
  }

  while (overBudget() && papers.length > 5) {
    const drop = papers
      .map((paper, index) => ({ paper, index }))
      .sort((a, b) => scoreAsc(a.paper, a.index, b.paper, b.index))[0];
    if (!drop) break;
    papers = papers.filter((_, index) => index !== drop.index);
    droppedPapers += 1;
  }

  while (overBudget() && history.length > 0) {
    history = history.slice(1);
    droppedHistoryTurns += 1;
  }

  return { papers, history, truncatedAbstracts, droppedPapers, droppedHistoryTurns };
}

function scoreAsc(a: BudgetPaper, ai: number, b: BudgetPaper, bi: number): number {
  const as = Number.isFinite(a.score) ? a.score! : Number.NEGATIVE_INFINITY;
  const bs = Number.isFinite(b.score) ? b.score! : Number.NEGATIVE_INFINITY;
  return as - bs || bi - ai;
}
