import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateBookmark, useDeleteBookmark } from "@/features/bookmarks";
import { AddToProjectDropdown } from "@/features/projects/components/add-to-project-dropdown";
import { toast } from "sonner";
import { formatLanguageName } from "@/utils/language";
import { formatNumber } from "@/utils";
import { useAuthStore } from "@/stores/auth-store";

export interface PaperCardProps {
  id: string;
  title: string;
  authors: string;
  journal: string;
  abstract: string;
  score: string;
  // Optional props
  date?: string;
  doi?: string;
  keywords?: string[];
  isBookmarked?: boolean;
  bookmarkId?: string;
  showBookmark?: boolean;
  publicationYear?: number;
  citationCount?: number;
  primaryProvider?: string;
  language?: string;
  paperKind?: string;
  openAccessUrl?: string;
  dataQualityScore?: number;
  aiScore?: number;
  rerankScore?: number;
  taxonomyBoostScore?: number;
  searchMode?: "semantic" | "keyword";
}

export function PaperCard({
  id,
  title,
  authors,
  journal,
  abstract,
  score,
  date,
  doi,
  keywords = [],
  isBookmarked = false,
  bookmarkId,
  showBookmark = false,
  publicationYear,
  citationCount,
  primaryProvider,
  language,
  paperKind,
  openAccessUrl,
  dataQualityScore,
  aiScore,
  rerankScore,
  taxonomyBoostScore,
  searchMode = "semantic",
}: PaperCardProps) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();

  const handleBookmarkToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isBookmarked && bookmarkId) {
      deleteBookmark.mutate(
        { id: bookmarkId, targetKind: "paper", targetId: id },
        {
          onSuccess: () => toast.success("Removed from library"),
          onError: () => toast.error("Failed to remove from library"),
        }
      );
    } else {
      createBookmark.mutate(
        { targetKind: "paper", targetId: id },
        {
          onSuccess: () => toast.success("Saved to library"),
          onError: () => toast.error("Failed to save to library"),
        }
      );
    }
  };

  const isSemantic = searchMode === "semantic" && score !== "N/A" && score !== undefined;
  const hasRerank = rerankScore !== undefined;
  const hasTaxonomyBoost = taxonomyBoostScore !== undefined && taxonomyBoostScore > 0;
  const rerankLabel = rerankScore === undefined
    ? undefined
    : rerankScore >= 0.9
      ? "Direct"
      : rerankScore >= 0.7
        ? "Strong"
        : rerankScore >= 0.45
          ? "Partial"
          : rerankScore >= 0.2
            ? "Weak"
            : "Low";

  return (
    <div
      data-testid="paper-card"
      data-paper-id={id}
      className="bg-gradient-to-br from-white via-white to-slate-50/40 dark:from-[#151518] dark:via-[#121212] dark:to-[#181820]/30 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_-6px_rgba(99,102,241,0.12)] hover:-translate-y-0.5 hover:border-indigo-200/80 dark:hover:border-indigo-900/60 transition-all duration-300 relative flex flex-col justify-between min-h-[190px]"
    >
      <div>
        {/* Title & Actions */}
        <div className="flex items-start justify-between gap-2 sm:gap-4 mb-2.5">
          <div className="flex-1 min-w-0">
            <Link
              data-testid="paper-detail-link"
              to={`/papers/${id}`}
              className="text-[19px] font-extrabold text-slate-800 dark:text-slate-100 leading-snug hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer block mb-2 transition-colors duration-200"
            >
              {title}
            </Link>

            {/* S5: Rich Academic Metadata (Primary) */}
            <div className="text-[12.5px] font-medium text-slate-400 dark:text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1 select-none">
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{authors}</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-slate-500 dark:text-slate-300">{journal}</span>
              {publicationYear && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span>{publicationYear}</span>
                </>
              )}
              {citationCount !== undefined && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span>Citations: {formatNumber(citationCount)}</span>
                </>
              )}
              {paperKind && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="capitalize">{paperKind}</span>
                </>
              )}
              {language && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span title={`Source language: ${formatLanguageName(language)}`}>
                    {formatLanguageName(language)}
                  </span>
                </>
              )}
              {openAccessUrl && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="bg-emerald-50/60 dark:bg-emerald-500/10 border border-emerald-150 dark:border-emerald-500/20 text-emerald-650 dark:text-emerald-450 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Open Access
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 select-none">
            {showBookmark && (
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-full transition-colors ${
                  isBookmarked
                    ? "text-amber-500 hover:text-amber-600 bg-amber-500/10 hover:bg-amber-500/20"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                onClick={handleBookmarkToggle}
                disabled={createBookmark.isPending || deleteBookmark.isPending}
                aria-label={isBookmarked ? "Remove paper from library" : "Save paper to library"}
                title={isBookmarked ? "Remove from library" : "Save to library"}
              >
                <Bookmark className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`} />
              </Button>
            )}

            {currentUser && <AddToProjectDropdown paperId={id} />}
          </div>
        </div>

        {/* Abstract */}
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 mt-4 mb-4 border-l-2 border-slate-200/80 dark:border-slate-800 pl-4 italic">
          {abstract}
        </p>

        {/* Keywords */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border border-slate-200/40 dark:border-slate-800 px-2.5 py-0.5 rounded-md text-[11px] font-medium hover:bg-indigo-50/50 hover:text-indigo-600 hover:border-indigo-200 dark:hover:bg-indigo-950/20 dark:hover:text-indigo-400 dark:hover:border-indigo-900/50 transition-all duration-200"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer: Source, System metrics & DOI */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-y-2 text-[11px] font-medium text-slate-400 dark:text-slate-500 select-none">
        <div className="flex items-center gap-x-2 sm:gap-x-3.5 flex-wrap">
          {primaryProvider && (
            <span className="uppercase text-[9px] bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 font-bold border border-slate-200/60 dark:border-slate-800 mr-1">
              Source: {primaryProvider}
            </span>
          )}

          {dataQualityScore !== undefined && (
            <span className="flex items-center gap-1.5" title={`Data quality score: ${Math.round(dataQualityScore * 100)}%`}>
              <span className={`w-1.5 h-1.5 rounded-full ${Math.round(dataQualityScore * 100) >= 80 ? "bg-emerald-500" : "bg-amber-500"}`}></span>
              Quality: <span className="text-slate-600 dark:text-slate-300 font-bold">{Math.round(dataQualityScore * 100)}%</span>
            </span>
          )}

          {aiScore !== undefined && (
            <>
              <span className="text-slate-200 dark:text-slate-800">|</span>
              <span className="flex items-center gap-1.5" title={`Deterministic academic impact score: ${aiScore}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Academic Impact: <span className="text-blue-600 dark:text-blue-400 font-bold">{aiScore.toFixed(2)}</span>
              </span>
            </>
          )}

          {isSemantic && (
            <>
              <span className="text-slate-200 dark:text-slate-800">|</span>
              {hasRerank ? (
                <span
                  className="flex items-center gap-1.5"
                  title={`AI ordinal relevance score: ${rerankScore!.toFixed(2)}. This is a ranking signal, not a probability or confidence.`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  <span>AI Reranked</span>:{" "}
                  <span className="text-purple-600 dark:text-purple-400 font-bold">{rerankLabel}</span>
                  <span className="text-[9px] text-slate-400 font-medium">(Vector: {parseFloat(score).toFixed(2)})</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5" title="Semantic Vector Similarity Score">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  Semantic Match: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{parseFloat(score).toFixed(2)}</span>
                </span>
              )}
            </>
          )}

          {hasTaxonomyBoost && (
            <>
              <span className="text-slate-200 dark:text-slate-800">|</span>
              <span
                className="flex items-center gap-1.5"
                title="Small relevance boost because the query matches OpenAlex topic, subfield, field, or domain metadata"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                Taxonomy Boost:
                <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                  +{taxonomyBoostScore!.toFixed(2)}
                </span>
              </span>
            </>
          )}
        </div>

        {doi && (
          <a
            href={`https://doi.org/${doi}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline hover:text-blue-700 dark:hover:text-blue-300 font-mono text-[10px]"
            onClick={(e) => e.stopPropagation()}
          >
            doi:{doi} <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}
