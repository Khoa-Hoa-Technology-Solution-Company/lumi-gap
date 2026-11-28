import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isAdminSystemRole } from "@trend/shared-types";
import { useCurrentUser } from "@/features/auth";
import { isLecturerWorkspaceEligible } from "@/features/auth/utils/lecturer-eligibility";
import { RouteAwarePageSkeleton, SectionErrorState } from "./loading";

/**
 * Authoritative route guard for Lecturer Workspace (`/mentor-workspace` & `/lecturer-workspace`).
 * Prevents mounting the Lecturer Workspace shell or triggering lecturer-only queries for
 * students, researchers, unverified/pending/rejected/revoked lecturers, or unverified admins.
 */
export function LecturerWorkspaceRoute() {
  const location = useLocation();
  const { data, isLoading, isFetching, error, refetch } = useCurrentUser();

  if (isLoading) return <RouteAwarePageSkeleton />;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <SectionErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />
      </div>
    );
  }

  const { user } = data;
  if (user.systemRole !== "ADMIN" && !user.emailVerifiedAt) {
    return <Navigate to="/verify-email" replace />;
  }

  // Backward-compatible redirect for legacy `?view=research-projects` bookmarks so personal
  // project libraries stay accessible in `/projects` without requiring lecturer verification.
  const params = new URLSearchParams(location.search);
  if (params.get("view") === "research-projects") {
    return <Navigate to="/projects" replace />;
  }

  if (!isLecturerWorkspaceEligible(user)) {
    if (user.academicRole === "LECTURER") {
      return (
        <Navigate
          to="/settings/verification/lecturer?access=required"
          state={{ from: `${location.pathname}${location.search}${location.hash}` }}
          replace
        />
      );
    }
    return <Navigate to={isAdminSystemRole(user.systemRole) ? "/admin" : "/home"} replace />;
  }

  return <Outlet />;
}
