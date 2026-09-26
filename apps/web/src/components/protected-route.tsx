import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { requiresAcademicProfile, useCurrentUser } from "@/features/auth";

/**
 * Gate child routes behind an authenticated session.
 *
 * Wrap a `<Route>` with `element={<ProtectedRoute />}` to redirect unauth'd
 * users to `/login`. The original location is preserved in `state.from` so the
 * LoginForm can return them to the page they wanted after a successful sign-in.
 */
export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.tokens?.accessToken);
  const storedUser = useAuthStore((s) => s.user);
  const currentUser = useCurrentUser();
  const user = currentUser.data?.user ?? storedUser;
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Persisted auth state can be stale after a server-side verification or data
  // migration. Wait for the first /auth/me result before making a verification
  // redirect. Using isLoading (not isFetching) avoids blocking on background
  // refetches when we already have user data from a prior fetch or placeholder.
  if (currentUser.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center dark:bg-[#09090b]" role="status" aria-busy="true">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading page...</p>
      </div>
    );
  }

  if (currentUser.isError || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiresAcademicProfile(user)) {
    return <Navigate to="/onboarding/academic-profile" replace />;
  }

  return <Outlet />;
}
