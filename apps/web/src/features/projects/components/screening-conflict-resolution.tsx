import { ScreeningConflictResolution as ConsensusDiscussion } from "./screening-consensus-discussion";
import { LegacyScreeningConflictResolution } from "./screening-legacy-discussion";
export { ScreeningDiscussionCountdown } from "./screening-legacy-discussion";

/** Historical joint-agreement rounds keep their original UI; new rounds use the server's consensus contract. */
export function ScreeningConflictResolution(props: Parameters<typeof LegacyScreeningConflictResolution>[0] & { onBack?: () => void }) {
  return props.round.consensus ? <ConsensusDiscussion {...props} /> : <LegacyScreeningConflictResolution {...props} />;
}
