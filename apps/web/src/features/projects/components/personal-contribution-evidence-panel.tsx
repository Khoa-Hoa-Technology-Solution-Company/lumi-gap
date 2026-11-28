import { PersonalContributionProfile } from "./personal-contribution-profile";

interface Props {
  projectId: string;
}

export function PersonalContributionEvidencePanel({ projectId }: Props) {
  return <PersonalContributionProfile scope="project" projectId={projectId} embedded />;
}
