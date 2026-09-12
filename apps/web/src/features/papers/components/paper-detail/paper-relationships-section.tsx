import { Link } from "react-router-dom";
import {
  ExternalLink,
  GitBranch,
  Layers,
  Link2,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Paper, PaperRef } from "@trend/shared-types";

export interface PaperRelationshipsSectionProps {
  paper: Paper;
  // D1. References
  references?: (PaperRef | Paper)[];
  totalReferenced?: number;
  inCorpusReferences?: number;
  isRefsLoading?: boolean;
  isRefsError?: boolean;
  onRetryReferences?: () => void;
  // D2. OpenAlex Related
  openAlexRelatedResponse?: {
    relatedWorks?: (PaperRef | Paper)[];
    totalRelated?: number;
    inCorpus?: number;
  };
  isOpenAlexRelatedLoading?: boolean;
  isOpenAlexRelatedError?: boolean;
  onRetryOpenAlexRelated?: () => void;
  // D3. Semantically Similar
  relatedPapers?: (PaperRef | Paper | (Paper & { score?: number }))[];
  isRelatedLoading?: boolean;
  isRelatedError?: boolean;
  onRetryRelated?: () => void;
}

export function formatIndexedCitationCoverage(
  inCorpus: number,
  totalReferenced?: number,
): string {
  if (totalReferenced === undefined || totalReferenced === null || totalReferenced <= 0) {
    return "OpenAlex did not provide a reference count for this work.";
  }

  const pct = Math.round((inCorpus / totalReferenced) * 100);
  return `${inCorpus} of ${totalReferenced} citations indexed (${pct}%)`;
}

export function PaperRelationshipsSection({
  paper,
  references,
  totalReferenced,
  inCorpusReferences,
  isRefsLoading,
  isRefsError,
  onRetryReferences,
  openAlexRelatedResponse,
  isOpenAlexRelatedLoading,
  isOpenAlexRelatedError,
  onRetryOpenAlexRelated,
  relatedPapers,
  isRelatedLoading,
  isRelatedError,
  onRetryRelated,
}: PaperRelationshipsSectionProps) {
  return (
    <section aria-labelledby="evidence-section-title" className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <h2
          id="evidence-section-title"
          className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2"
        >
          <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Evidence and related literature
        </h2>
      </div>

      {/* D1. Cited papers indexed in PaperLens */}
      <CitedPapersBlock
        references={references}
        totalReferenced={totalReferenced}
        inCorpus={inCorpusReferences}
        isLoading={isRefsLoading}
        isError={isRefsError}
        onRetry={onRetryReferences}
      />

      {/* D2. OpenAlex related works */}
      <OpenAlexRelatedWorksBlock
        openAlexRelatedResponse={openAlexRelatedResponse}
        isLoading={isOpenAlexRelatedLoading}
        isError={isOpenAlexRelatedError}
        onRetry={onRetryOpenAlexRelated}
      />

      {/* D3. Semantically similar papers */}
      <SemanticallySimilarPapersBlock
        relatedPapers={relatedPapers}
        isLoading={isRelatedLoading}
        isError={isRelatedError}
        onRetry={onRetryRelated}
      />
    </section>
  );
}

function CitedPapersBlock({
  references,
  totalReferenced,
  inCorpus,
  isLoading,
  isError,
  onRetry,
}: {
  references?: (PaperRef | Paper)[];
  totalReferenced?: number;
  inCorpus?: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const hasTotal = totalReferenced !== undefined && totalReferenced !== null && totalReferenced > 0;
  const inCorpusCount = inCorpus ?? (references ? references.length : 0);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Cited papers indexed in PaperLens
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            These are works cited by this paper. Only papers already indexed in PaperLens can be opened here.
          </p>
        </div>

        {/* Coverage Label */}
        {hasTotal ? (
          <Badge variant="secondary" className="font-semibold text-xs shrink-0">
            {formatIndexedCitationCoverage(inCorpusCount, totalReferenced)}
          </Badge>
        ) : (
          <span className="text-xs text-slate-400 italic shrink-0">
            OpenAlex did not provide a reference count for this work.
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-xs font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          Loading cited papers...
        </div>
      )}

      {isError && (
        <div role="alert" className="flex items-center justify-between rounded-xl bg-red-50 p-3.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <span>Failed to load references.</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="h-7 text-xs font-bold border-red-200 bg-white dark:bg-slate-900">
              <RefreshCw className="mr-1 h-3 w-3" /> Try again
            </Button>
          )}
        </div>
      )}

      {!isLoading && !isError && references && references.length > 0 && (
        <div className="grid gap-3">
          {references.map((refPaper) => (
            <PaperReferenceCard key={refPaper.id} paper={refPaper} />
          ))}
        </div>
      )}

      {!isLoading && !isError && (!references || references.length === 0) && (
        <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
          {hasTotal
            ? `This work cites ${totalReferenced} papers, but none are currently indexed in PaperLens.`
            : "No cited paper references supplied for this work."}
        </div>
      )}
    </div>
  );
}

function OpenAlexRelatedWorksBlock({
  openAlexRelatedResponse,
  isLoading,
  isError,
  onRetry,
}: {
  openAlexRelatedResponse?: {
    relatedWorks?: (PaperRef | Paper)[];
    totalRelated?: number;
    inCorpus?: number;
  };
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const works = openAlexRelatedResponse?.relatedWorks ?? [];
  const totalRelated = openAlexRelatedResponse?.totalRelated;
  const inCorpus = openAlexRelatedResponse?.inCorpus;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            OpenAlex related works
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            OpenAlex identifies these works as related through its scholarly graph. They are not necessarily cited by this paper.
          </p>
        </div>

        {totalRelated !== undefined && (
          <Badge variant="secondary" className="font-semibold text-xs shrink-0">
            {inCorpus ?? works.length} of {totalRelated} in PaperLens
          </Badge>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-xs font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
          Loading OpenAlex related works...
        </div>
      )}

      {isError && (
        <div role="alert" className="flex items-center justify-between rounded-xl bg-red-50 p-3.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <span>Failed to load OpenAlex related works.</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="h-7 text-xs font-bold border-red-200 bg-white dark:bg-slate-900">
              <RefreshCw className="mr-1 h-3 w-3" /> Try again
            </Button>
          )}
        </div>
      )}

      {!isLoading && !isError && works.length > 0 && (
        <div className="grid gap-3">
          {works.map((work) => (
            <PaperReferenceCard key={work.id} paper={work} />
          ))}
        </div>
      )}

      {!isLoading && !isError && works.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
          OpenAlex has not supplied related-work links for this paper.
        </div>
      )}
    </div>
  );
}

function SemanticallySimilarPapersBlock({
  relatedPapers,
  isLoading,
  isError,
  onRetry,
}: {
  relatedPapers?: (PaperRef | Paper | (Paper & { score?: number }))[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const papers = relatedPapers ?? [];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-4">
      <div>
        <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          Semantically similar papers
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          PaperLens matches title and abstract meaning. This is independent of citations and OpenAlex relations.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-xs font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
          Finding semantically similar papers...
        </div>
      )}

      {isError && (
        <div role="alert" className="flex items-center justify-between rounded-xl bg-red-50 p-3.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <span>Failed to search for semantically similar papers.</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="h-7 text-xs font-bold border-red-200 bg-white dark:bg-slate-900">
              <RefreshCw className="mr-1 h-3 w-3" /> Try again
            </Button>
          )}
        </div>
      )}

      {!isLoading && !isError && papers.length > 0 && (
        <div className="grid gap-3">
          {papers.map((similarPaper) => (
            <PaperReferenceCard key={similarPaper.id} paper={similarPaper} showSemanticSimilarity />
          ))}
        </div>
      )}

      {!isLoading && !isError && papers.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
          No semantically similar papers found in the corpus.
        </div>
      )}
    </div>
  );
}

function PaperReferenceCard({
  paper,
  showSemanticSimilarity,
}: {
  paper: PaperRef | Paper | (Paper & { score?: number });
  showSemanticSimilarity?: boolean;
}) {
  const authorSummary =
    paper.authors && paper.authors.length > 0
      ? paper.authors.slice(0, 3).map((a) => a.displayName).join(", ") +
        (paper.authors.length > 3 ? ` et al.` : "")
      : "Unknown authors";

  // Check DOI either on doi property directly (PaperRef) or externalIds.doi (Paper)
  const doi = "doi" in paper && paper.doi ? paper.doi : "externalIds" in paper ? paper.externalIds?.doi : undefined;
  const journalName = "journalName" in paper ? paper.journalName : undefined;

  return (
    <div className="group rounded-xl border border-slate-200/70 bg-slate-50/40 p-4 transition-all hover:border-blue-300 hover:bg-blue-50/20 dark:border-slate-800/70 dark:bg-slate-900/40 dark:hover:border-blue-800 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/papers/${paper.id}`}
          className="text-xs font-bold text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400 line-clamp-2 leading-snug"
        >
          {paper.title}
        </Link>
        {showSemanticSimilarity && (
          <Badge variant="outline" className="text-[10px] font-semibold text-purple-700 border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-300 shrink-0">
            Semantic similarity
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span>{authorSummary}</span>
        {paper.publicationYear && <span>• {paper.publicationYear}</span>}
        {journalName && <span>• {journalName}</span>}
      </div>

      {doi && (
        <a
          href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:underline dark:text-blue-400 pt-0.5"
        >
          DOI: {doi.replace(/^https?:\/\/doi\.org\//i, "")}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
