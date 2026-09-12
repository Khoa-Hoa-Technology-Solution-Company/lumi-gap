import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  MessageSquare,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  Paper,
  PaperTopic,
  QualityView,
  UserRatingDetail,
} from "@trend/shared-types";
import { formatNumber } from "@/utils";
import { api } from "@/services/api-client";
import { toast } from "sonner";

export interface PaperMetadataSidebarProps {
  paper: Paper;
  reportCount?: number;
  isReportCountLoading?: boolean;
  currentUser?: { id: string; role?: string } | null;
  ratingView?: QualityView | null;
  ratingLoading?: boolean;
  ratingError?: string | null;
  onRefreshRatingView?: () => void | Promise<void>;
}

export function getBestTaxonomyTopic(topics: PaperTopic[]): PaperTopic | null {
  if (!topics || topics.length === 0) return null;
  const hasHierarchy = (topic: PaperTopic) => Boolean(
    topic.domainName || topic.fieldName || topic.subfieldName,
  );

  return topics.find((topic) => topic.isPrimary)
    ?? topics.find(hasHierarchy)
    ?? topics[0]
    ?? null;
}

export function getReviewFormDraft(myRating?: QualityView["myRating"]): {
  stars: number;
  comment: string;
} {
  return {
    stars: myRating?.stars ?? 0,
    comment: myRating?.comment ?? "",
  };
}

export function PaperMetadataSidebar({
  paper,
  reportCount,
  isReportCountLoading,
  currentUser,
  ratingView,
  ratingLoading,
  ratingError,
  onRefreshRatingView,
}: PaperMetadataSidebarProps) {
  const taxonomyTopic = getBestTaxonomyTopic(paper.topics ?? []);
  const overallSignalPct = paper.aiScore ? Math.round(paper.aiScore.finalScore * 100) : null;
  const isOpenAccess = Boolean(paper.openAccessUrl || (paper.openAccessStatus && paper.openAccessStatus !== "closed"));

  return (
    <aside className="w-full lg:w-80 shrink-0 space-y-6">
      {/* 1. Research Signal Card */}
      {overallSignalPct !== null && (
        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/50 to-white p-5 shadow-xs dark:border-blue-900/40 dark:from-blue-950/30 dark:to-[#11161F] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Award className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Research signal
            </span>
            <Badge variant="outline" className="border-blue-300 bg-blue-100/50 text-[10px] font-bold text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
              Deterministic
            </Badge>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-blue-700 dark:text-blue-300 font-mono">
              {overallSignalPct} / 100
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Deterministic impact & metadata signal.
          </p>
        </div>
      )}

      {/* 2. Work Facts */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-5">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-slate-500" />
            Work facts
          </h3>
          <p className="text-[11px] text-slate-400">OpenAlex metadata when available</p>
        </div>

        {/* Group A: Publication */}
        <div className="space-y-2 text-xs border-b border-slate-100 pb-4 dark:border-slate-800/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Publication
          </span>
          <FactRow label="Publication year" value={paper.publicationYear} />
          <FactRow label="Work type" value={paper.paperKind} />
          <FactRow label="Journal / Source" value={paper.journalName} />
          <FactRow label="Language" value={paper.language?.toUpperCase()} />
        </div>

        {/* Group B: Impact */}
        <div className="space-y-2 text-xs border-b border-slate-100 pb-4 dark:border-slate-800/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Impact
          </span>
          <FactRow label="FWCI" value={paper.fwci !== undefined && paper.fwci !== null ? paper.fwci.toFixed(2) : undefined} />
          <FactRow label="Citations" value={paper.citationCount !== undefined ? formatNumber(paper.citationCount) : undefined} />
          <FactRow label="Related works count" value={paper.relatedWorksCount !== undefined ? formatNumber(paper.relatedWorksCount) : undefined} />
        </div>

        {/* Group C: Classification */}
        <div className="space-y-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Classification & Open Access
          </span>

          <FactRow
            label="Open Access"
            value={isOpenAccess ? "Yes (Open Access)" : "No"}
          />

          {taxonomyTopic ? (
            <div className="space-y-1.5 pt-1">
              {taxonomyTopic.domainName && (
                <TaxonomyLink label="Domain" id={taxonomyTopic.domainId} name={taxonomyTopic.domainName} />
              )}
              {taxonomyTopic.fieldName && (
                <TaxonomyLink label="Field" id={taxonomyTopic.fieldId} name={taxonomyTopic.fieldName} />
              )}
              {taxonomyTopic.subfieldName && (
                <TaxonomyLink label="Subfield" id={taxonomyTopic.subfieldId} name={taxonomyTopic.subfieldName} />
              )}
              {taxonomyTopic.topicName && (
                <TaxonomyLink label="Topic" id={taxonomyTopic.topicId || taxonomyTopic.openalexTopicId} name={taxonomyTopic.topicName} />
              )}
            </div>
          ) : (
            <p className="text-[11px] italic text-slate-400 pt-1">
              OpenAlex taxonomy fields have not been synced for this work yet.
            </p>
          )}
        </div>
      </div>

      {/* 3. AI Reports Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            AI Reports
          </span>
          {reportCount !== undefined && (
            <Badge variant="secondary" className="font-semibold text-xs font-mono">
              {formatNumber(reportCount)}
            </Badge>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Synthesized reports referencing this work in PaperLens.
        </p>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full justify-between h-8 text-xs font-semibold border-slate-200 dark:border-slate-800"
        >
          <Link to={`/reports?citesPaper=${paper.id}`}>
            <span>View citing reports</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {/* 4. Community Ratings & Reviews */}
      <CommunityRatingsCard
        paperId={paper.id}
        currentUser={currentUser}
        ratingView={ratingView}
        ratingLoading={ratingLoading}
        ratingError={ratingError}
        onRefresh={onRefreshRatingView}
      />
    </aside>
  );
}

function FactRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-900 dark:text-slate-200">
        {value !== undefined && value !== null && value !== "" ? (
          value
        ) : (
          <span className="italic text-slate-400">Not available</span>
        )}
      </span>
    </div>
  );
}

function TaxonomyLink({ label, id, name }: { label: string; id?: string; name: string }) {
  const url = id
    ? `https://openalex.org/${id.replace(/^https?:\/\/openalex\.org\//i, "")}`
    : undefined;

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400 max-w-[160px] truncate"
        >
          <span className="truncate">{name}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="font-medium text-slate-800 dark:text-slate-200 max-w-[160px] truncate">
          {name}
        </span>
      )}
    </div>
  );
}

function CommunityRatingsCard({
  paperId,
  currentUser,
  ratingView,
  ratingLoading,
  ratingError,
  onRefresh,
}: {
  paperId: string;
  currentUser?: { id: string; role?: string } | null;
  ratingView?: QualityView | null;
  ratingLoading?: boolean;
  ratingError?: string | null;
  onRefresh?: () => void | Promise<void>;
}) {
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const myRating = ratingView?.myRating;
  const reviews = ratingView?.allRatings ?? [];
  const averageRating = ratingView?.ratingSummary?.avg;

  useEffect(() => {
    const draft = getReviewFormDraft(myRating);
    setStars(draft.stars);
    setComment(draft.comment);
  }, [myRating?.stars, myRating?.comment]);

  const handleSubmittingReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      toast.error("Please sign in to leave a review.");
      return;
    }
    if (stars < 1 || stars > 5) {
      toast.error("Please choose a rating from 1 to 5 stars.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/quality/rate`, {
        targetKind: "paper",
        targetId: paperId,
        stars,
        comment,
      });
      toast.success(myRating ? "Review updated successfully." : "Review submitted successfully.");
      setShowReviewForm(false);
      await onRefresh?.();
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReview = async (ratingId: string) => {
    if (!confirm("Delete your review?")) return;

    setDeletingReviewId(ratingId);
    try {
      await api.delete(`/quality/rate/${ratingId}`);
      toast.success("Review deleted successfully.");
      setShowReviewForm(false);
      await onRefresh?.();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete review.");
    } finally {
      setDeletingReviewId(null);
    }
  };

  const canReview = Boolean(currentUser && currentUser.role !== "admin");

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-amber-500" />
            Ratings & reviews
          </h3>
          <p className="text-[11px] text-slate-400">Community feedback</p>
        </div>

        {averageRating !== undefined && averageRating > 0 && (
          <div className="flex items-center gap-1 font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span>{averageRating.toFixed(1)} / 5</span>
          </div>
        )}
      </div>

      {ratingLoading && (
        <p className="text-xs italic text-slate-400">Loading reviews...</p>
      )}

      {ratingError && (
        <p className="text-xs text-red-500">{ratingError}</p>
      )}

      {!ratingLoading && !ratingError && (
        <div className="space-y-3">
          {reviews.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {reviews.map((r: UserRatingDetail, idx: number) => (
                <div key={r.id || idx} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/40 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {r.user?.fullName || "Researcher"}
                    </span>
                    <div className="flex items-center gap-1 text-amber-400">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">{r.stars}</span>
                      {r.user?.id === currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => handleDeleteReview(r.id)}
                          disabled={deletingReviewId === r.id}
                          className="ml-1 rounded p-1 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/30"
                          aria-label="Delete your review"
                          title="Delete your review"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {r.comment && (
                    <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-tight">
                      {r.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-slate-400">
              No community reviews yet. Be the first to rate this work.
            </p>
          )}

          {/* Write Review Action */}
          {canReview ? (
            <div>
              {!showReviewForm ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReviewForm(true)}
                  className="w-full h-8 text-xs font-semibold border-slate-200 dark:border-slate-800"
                >
                  {myRating ? "Edit your review" : "Write a review"}
                </Button>
              ) : (
                <form onSubmit={handleSubmittingReview} className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold">Rating:</span>
                    <select
                      value={stars}
                      onChange={(e) => setStars(Number(e.target.value))}
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs dark:border-slate-800 dark:bg-slate-900"
                    >
                      <option value={0} disabled>Select a rating</option>
                      {[5, 4, 3, 2, 1].map((s) => (
                        <option key={s} value={s}>{s} Stars</option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share your thoughts on this paper..."
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-800 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowReviewForm(false)}
                      className="h-7 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting}
                      size="sm"
                      className="h-7 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700"
                    >
                      {submitting ? "Submitting..." : "Submit"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 text-center">
              Sign in to rate or review this paper.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
