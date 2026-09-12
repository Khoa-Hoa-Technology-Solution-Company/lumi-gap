import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Gate child routes behind an authenticated session.
 *
 * Wrap a `<Route>` with `element={<ProtectedRoute />}` to redirect unauth'd
 * users to `/login`. The original location is preserved in `state.from` so the
 * LoginForm can return them to the page they wanted after a successful sign-in.
 */
export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.tokens?.accessToken);
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
