import { Navigate, useParams } from "react-router-dom";

export function ProjectPlanReviewPage() {
  const { id } = useParams();
  if (!id) return null;
  return <Navigate replace to={`/academic-support/projects/${encodeURIComponent(id)}`} />;
}
