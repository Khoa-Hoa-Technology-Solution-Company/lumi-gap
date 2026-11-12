import type { ScreeningRoundView, WorkspacePerson } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { choiceLabels, isConflictedRound } from "./screening-common";
import { ScreeningDiscussion, useScreeningDiscussion } from "./screening-discussion";

export function ReviewVersionHistory({ round, assignmentId, beforeRevision }: { round: ScreeningRoundView; assignmentId: string; beforeRevision: number }) {
  const earlier = round.reviewHistory?.filter(r => r.assignmentId === assignmentId && r.revision < beforeRevision) ?? [];
  if (!earlier.length) return null;
  return <details className="mt-2 border-t pt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Lịch sử đánh giá ({earlier.length})</summary>{earlier.map(review => <div key={review.id} className="mt-2"><strong>Phiên bản {review.revision} · {choiceLabels[review.decision]}</strong><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{review.comment || review.exclusionReason}</p><time dateTime={review.submittedAt}>{new Date(review.submittedAt).toLocaleString("vi-VN")}</time></div>)}</details>;
}

export function RoundHistory({ projectId, round, people, readOnly, visible = true }: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean; visible?: boolean }) {
  const actorId = useAuthStore(state => state.user?.id);
  const allowDiscussion = isConflictedRound(round) || round.settings.reviewMode === "COLLABORATIVE" || Boolean(round.finalDecision && !round.hiddenReviews);
  if (!allowDiscussion) return null;
  return <RoundDiscussionContent key={`${projectId}:${round.id}:${actorId}`} projectId={projectId} round={round} people={people} readOnly={readOnly} visible={visible} />;
}
function RoundDiscussionContent({ projectId, round, people, readOnly, visible }: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean; visible: boolean }) {
  const discussion = useScreeningDiscussion(projectId, round, visible);
  return <section className="paper-discussion screening-round-discussion" data-screening-section="discussion">
    <ScreeningDiscussion projectId={projectId} round={round} people={people} readOnly={readOnly} query={discussion} visible={visible} />
  </section>;
}
