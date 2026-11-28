import { Navigate, Outlet } from "react-router-dom";
import { useCurrentUser } from "@/features/auth";
import { RouteAwarePageSkeleton, SectionErrorState } from "./loading";

export function ResearchWorkflowRoute() {
  const { data, isLoading, isFetching, error, refetch } = useCurrentUser();
  if (isLoading) return <RouteAwarePageSkeleton />;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <SectionErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />
      </div>
    );
  }
  if (data.user.systemRole !== "ADMIN" && !data.user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;
  return <Outlet />;
}
