import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { requiresAcademicProfile, useCurrentUser } from "@/features/auth";
import { AppLoading } from "@/components/loading";

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

  // A persisted user is only a placeholder until /auth/me confirms onboarding.
  // Cached API data can still render during a background refresh.
  if (currentUser.isLoading || currentUser.isPlaceholderData) {
    return <AppLoading />;
  }

  if (currentUser.isError || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.systemRole !== "ADMIN" && !user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;

  if (requiresAcademicProfile(user)) {
    return <Navigate to="/onboarding/academic-profile" state={{ from: `${location.pathname}${location.search}${location.hash}` }} replace />;
  }

  return <Outlet />;
}
