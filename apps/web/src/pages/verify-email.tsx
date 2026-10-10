import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { authApi, resolvePostAuthPath, useLogout } from "@/features/auth";
import { useAuthStore } from "@/stores/auth-store";
import { LanguageSwitcher, useI18n } from "@/i18n";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { t } = useI18n();
  const user = useAuthStore(state => state.user);
  const token = params.get("token");
  const email = user?.email ?? params.get("email") ?? "";
  const handled = useRef<string>();
  const [status, setStatus] = useState(token ? "Verifying your email…" : "Check your inbox for the LumiGap verification link.");
  const [busy, setBusy] = useState(Boolean(token));
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    async function refresh() {
      if (!useAuthStore.getState().tokens?.accessToken) return false;
      const current = await authApi.me();
      useAuthStore.setState({ user: current.user });
      queryClient.setQueryData(["current-user"], current);
      if (current.user.emailVerifiedAt) { navigate(resolvePostAuthPath(current.user), { replace: true }); return true; }
      return false;
    }
    if (!token) { void refresh().catch(() => undefined); return; }
    if (handled.current === token) return;
    handled.current = token;
    void authApi.verifyEmail(token).then(async () => {
      setVerified(true);
      setStatus("Email verified. Continue with your academic profile.");
      await refresh().catch(() => undefined);
    }).catch(() => setStatus("This verification link is invalid or expired.")).finally(() => setBusy(false));
  }, [navigate, queryClient, token]);
  return <div className="w-full rounded-2xl border bg-white p-8 text-center dark:bg-[#18181b]" data-no-i18n>
    <div className="mb-5 flex justify-end"><LanguageSwitcher /></div>
    <h1 className="text-2xl font-semibold">{t("Verify your email")}</h1>
    <p role="status" className="mt-4 text-sm leading-6 text-muted-foreground">{t(status)}</p>
    {email && <p className="mt-2 text-sm">{email}</p>}
    <div className="mt-6 flex flex-col gap-3">
      {verified && <Button onClick={() => navigate(useAuthStore.getState().tokens?.accessToken && user ? resolvePostAuthPath(user) : "/login", { replace: true })}>{t("Continue")}</Button>}
      {email && !verified && <Button variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await authApi.resendEmailVerification(email); setStatus("A new verification email has been requested."); }
        catch { setStatus("Could not send verification email. Please try again."); }
        finally { setBusy(false); }
      }}>{t("Resend verification email")}</Button>}
      {user && <Button variant="ghost" disabled={logout.isPending} onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}>{t("Sign out")}</Button>}
    </div>
  </div>;
}
