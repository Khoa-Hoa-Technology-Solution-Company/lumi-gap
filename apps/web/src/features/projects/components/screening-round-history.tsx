import type { ScreeningRoundView, WorkspacePerson } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { isConflictedRound } from "./screening-common";
import { ScreeningDiscussion, useScreeningDiscussion } from "./screening-discussion";

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
