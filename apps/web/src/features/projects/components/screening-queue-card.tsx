import { Eye, ArrowRight } from "lucide-react";
import type { ScreeningPaperRow } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { WorkPaperCard } from "./screening-paper-card";

export function ScreeningQueueCard({ paper, disabled, claiming, readOnly, onPreview, onClaim }: {
  paper: ScreeningPaperRow; disabled: boolean; claiming: boolean; readOnly: boolean;
  onPreview: () => void; onClaim: () => void;
}) {
  const { t } = useI18n();
  const round = paper.round;
  if (!round) return null;
  const required = round.settings.requiredReviewers, occupied = round.assigned, submitted = round.completed;
  const remaining = Math.max(0, required - occupied);
  const awaitingSecond = required === 2 && submitted === 1;
  return <WorkPaperCard paper={{ paperId: paper.paperId, roundId: round.id, title: paper.title, publicationYear: paper.publicationYear || null,
    authors: paper.authors, journalName: paper.journalName, roundNumber: round.number, phase: round.phase, hiddenReviews: true,
    completed: submitted, required }} status={t(awaitingSecond ? "Awaiting a second review" : occupied ? "Last reviewer slot" : "Available for review")}
    roundLabel={t("Round {{number}} · {{phase}}", { number: round.number, phase: t(round.phase === "FULL_TEXT" ? "Full text" : "Title & abstract") })}
    progressLabel={t("{{count}}/{{required}} reviews submitted", { count: submitted, required })}
    tone={awaitingSecond ? "attention" : "neutral"} onOpen={onPreview} actions={<>
      <Button type="button" size="sm" variant="outline" onClick={onPreview} title={t("Preview without claiming a slot")}><Eye size={14} aria-hidden="true" />{t("Preview")}</Button>
      {!readOnly && <Button className="queue-claim-button" type="button" size="sm" disabled={disabled || remaining === 0 || round.canClaim === false} onClick={onClaim}>{t(claiming ? "Claiming…" : "Claim review")}<ArrowRight size={14} aria-hidden="true" /></Button>}
    </>}>
    {paper.doi && <p className="queue-doi">DOI: {paper.doi}</p>}
    {paper.abstractText && <p className="queue-abstract-preview">{paper.abstractText}</p>}
    {paper.proposalReason && <p className="queue-proposal-reason"><strong>{t("Proposal reason")}: </strong>{paper.proposalReason}</p>}
    <div className="queue-slot-summary"><strong>{t("{{count}}/{{required}} slots occupied", { count: occupied, required })}</strong><span>{t("{{count}} slots remaining", { count: remaining })}</span></div>
  </WorkPaperCard>;
}
