export type PrimaryLiteratureTab = "my-work" | "queue" | "library" | "analysis";

export type LiteratureView =
  | "my-work"
  | "queue"
  | "my-proposals"
  | "screening"
  | "library"
  | "clusters"
  | "matrix"
  | "limitations"
  | "evidence"
  | "organize";

export const PRIMARY_LITERATURE_VIEW_MAP: Record<string, PrimaryLiteratureTab> = {
  "my-work": "my-work",
  "queue": "queue",
  "my-proposals": "queue",
  "screening": "queue",
  "library": "library",
  "clusters": "analysis",
  "matrix": "analysis",
  "limitations": "analysis",
  "organize": "library",
  "evidence": "my-work",
};

const ANALYSIS_VIEWS = new Set(["clusters", "matrix", "limitations"]);

export function resolvePrimaryLiteratureTab(view: string | null | undefined): PrimaryLiteratureTab {
  if (!view) return "my-work";
  return PRIMARY_LITERATURE_VIEW_MAP[view] ?? "my-work";
}

export function buildLiteratureViewParams(current: URLSearchParams, nextView: string): URLSearchParams {
  const next = new URLSearchParams(current);
  next.set("view", nextView);
  next.delete("paper");
  next.delete("round");
  next.delete("section");
  if (!ANALYSIS_VIEWS.has(nextView)) {
    next.delete("compare");
  }
  return next;
}

