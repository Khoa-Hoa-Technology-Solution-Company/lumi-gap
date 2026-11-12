import { useEffect, useRef, useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { isAxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ScreeningClaimNextResult } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useResearchResource } from "../hooks/use-project-research";
import { screeningApi } from "../api/screening.api";
import { ScreeningError, ScreeningPager, useScreeningCommand } from "./screening-common";
import { ScreeningQueueCard } from "./screening-queue-card";
import "../screening-queue.css";

export function ScreeningQueueView({ projectId, readOnly, onOpenPaper, onAddPaper }: {
  projectId: string; readOnly: boolean;
  onOpenPaper: (paperId: string, context?: { roundId: string; section: string }) => void;
  onAddPaper?: () => void;
}) {
  const { t } = useI18n();
  const actorId = useAuthStore(state => state.user?.id);
  const cache = useQueryClient(), command = useScreeningCommand(projectId), busy = useRef(false);
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [q, setQ] = useState("");
  const [slotFilter, setSlotFilter] = useState<"ALL" | "UNCLAIMED" | "LAST_SLOT">("ALL");
  const [claimingId, setClaimingId] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => { setQ(search.trim()); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [search]);
  const boardQuery = useResearchResource(projectId, ["screening-queue", page, q, slotFilter],
    () => screeningApi.board(projectId, { filter: "QUEUE", page, pageSize: 12, q, slots: slotFilter }), true, () => !readOnly, 10000);
  const board = boardQuery.data;
  const available = board?.queueSummary?.available ?? board?.total ?? 0;
  const filtered = Boolean(q || slotFilter !== "ALL");
  useEffect(() => {
    if (board && board.page === page && !boardQuery.isFetching) {
      const last = Math.max(1, Math.ceil(board.total / board.pageSize));
      if (page > last) setPage(last);
    }
  }, [board, page, boardQuery.isFetching]);
  const items = (board?.items ?? []).filter(p => p.round && p.round.active && !p.round.finalDecision && !p.round.legacyNeedsAudit && !p.round.reviewerIntakeClosed &&
    !p.round.myAssignmentId && p.round.canClaim !== false && ["NOT_REVIEWED", "IN_REVIEW"].includes(p.round.status) && p.round.assigned < p.round.settings.requiredReviewers);
  const claim = async (roundId?: string) => {
    if (busy.current || readOnly) return;
    busy.current = true; setClaimingId(roundId ?? "next"); setNotice(null);
    let result: ScreeningClaimNextResult | undefined, failure: unknown;
    try {
      const ok = await command.run({ action: roundId ? "claim" : "claim-next", roundId }, async clientKey => {
        try { result = roundId ? await screeningApi.claim(projectId, roundId, { clientKey }) : await screeningApi.claimNext(projectId, { clientKey }); return result; }
        catch (error) { failure = error; throw error; }
      });
      if (ok && result?.paperId && result.roundId) {
        toast.success(t("Review claimed. Your slot is held for 24 hours."));
        onOpenPaper(result.paperId, { roundId: result.roundId, section: "review" });
      } else {
        await cache.invalidateQueries({ queryKey: ["project-research", actorId, projectId] });
        if (ok) toast.info(t("No eligible papers remain in the queue."));
        else {
          const status = isAxiosError(failure) ? failure.response?.status : undefined;
          const message = t(status === 409 ? "That slot was just taken. The queue has been refreshed; please choose another paper."
            : status === 403 || status === 404 ? "You cannot claim this paper. Your access or eligibility may have changed."
            : "Could not claim a review. Please try again.");
          setNotice(message); toast.error(message);
        }
      }
    } finally { busy.current = false; setClaimingId(null); }
  };
  const clearFilters = () => { setSearch(""); setQ(""); setSlotFilter("ALL"); setPage(1); };
  const filters = [{ value: "ALL", label: "All available", count: board?.queueSummary?.available },
    { value: "UNCLAIMED", label: "No reviewers (0/2)", count: board?.queueSummary?.unclaimed },
    { value: "LAST_SLOT", label: "Last slot (1/2)", count: board?.queueSummary?.lastSlot }] as const;
  return <section className="screening-queue-container" aria-label={t("Review queue")}>
    <header className="screening-queue-header">
      <div><div className="queue-heading"><h2>{t("Review queue")}</h2>{board && <span className="queue-count-badge">{t("{{count}} papers available", { count: available })}</span>}</div>
        <p className="queue-description">{t("One review already submitted? Those papers come first. Claims last 24 hours.")}</p></div>
      {!readOnly && available > 0 && <Button type="button" onClick={() => void claim()} disabled={command.isPending || claimingId !== null} title={t("Claim the next priority paper from the entire queue")}>{t(claimingId === "next" ? "Claiming…" : "Claim next paper")}</Button>}
    </header>
    <div className="queue-search-input-wrap"><Search size={16} className="queue-search-icon" aria-hidden="true" /><Input type="search" maxLength={200} aria-label={t("Search title, author, DOI or keywords")} placeholder={t("Search title, author, DOI or keywords")} value={search} onChange={event => setSearch(event.target.value)} className="queue-search-input" /></div>
    <div className="queue-toolbar"><div className="queue-slot-filters" role="group" aria-label={t("Filter reviewer slots")}>{filters.map(filter => <button key={filter.value} type="button" aria-pressed={slotFilter === filter.value} onClick={() => { setSlotFilter(filter.value); setPage(1); }}>{t(filter.label)}{filter.count !== undefined && <span>{filter.count}</span>}</button>)}</div>
      {filtered && <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>{t("Clear filters")}</Button>}</div>
    <div className="queue-help"><p>{t("Claimed slots are not submitted reviews.")}</p><details><summary>{t("Who can review?")}</summary><p>{t("In teams with at least three eligible members, your proposed papers are reserved for two other reviewers unless an exception is recorded.")}</p></details></div>
    {notice && <p role="alert" className="queue-command-error">{notice}</p>}
    {boardQuery.isLoading ? <div role="status" aria-label={t("Loading review queue…")} className="queue-paper-grid">{[0, 1, 2].map(i => <div className="queue-card-skeleton" key={i}><Skeleton className="h-4 w-1/3" /><Skeleton className="h-7 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-8 w-1/2" /></div>)}</div>
      : boardQuery.isError ? <ScreeningError error={boardQuery.error} retry={() => void boardQuery.refetch()} />
      : items.length ? <div aria-busy={boardQuery.isFetching || search.trim() !== q}>
        {filtered && <p className="queue-results" role="status">{t("{{count}} matching papers", { count: board?.total ?? 0 })}</p>}
        <div className="queue-paper-grid">{items.map(p => <ScreeningQueueCard key={p.paperId} paper={p} disabled={command.isPending || claimingId !== null} claiming={claimingId === p.round!.id} readOnly={readOnly}
          onPreview={() => onOpenPaper(p.paperId, { roundId: p.round!.id, section: "source" })} onClaim={() => void claim(p.round!.id)} />)}</div>
        {board && (page > 1 || board.hasNext) && <ScreeningPager page={page} total={board.total} hasNext={board.hasNext} onPage={setPage} />}
      </div> : <div className="queue-empty-state"><BookOpen size={28} aria-hidden="true" /><h3 className="queue-empty-title">{t(filtered ? "No papers match these filters" : "No review slots available")}</h3><p className="queue-empty-desc">{t(filtered ? "Try another keyword or clear the filters." : "Your claimed papers and submitted reviews are in My Work.")}</p>
        {filtered ? <Button type="button" variant="outline" onClick={clearFilters}>{t("Clear filters")}</Button> : onAddPaper && !readOnly && <Button type="button" size="sm" variant="outline" onClick={onAddPaper}>{t("Propose a paper")}</Button>}</div>}
  </section>;
}
