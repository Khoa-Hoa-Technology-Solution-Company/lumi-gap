import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { authApi, resolvePostAuthPath } from "@/features/auth";
import { useAuthStore } from "@/stores/auth-store";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const email = params.get("email") ?? "";
  const [status, setStatus] = useState(token ? "Verifying your email…" : "Check your inbox for the LumiGap verification link.");
  const [busy, setBusy] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      if (!useAuthStore.getState().tokens?.accessToken) return;
      void authApi.me().then((current) => {
        useAuthStore.setState({ user: current.user });
        if (current.user.emailVerifiedAt) {
          navigate(resolvePostAuthPath(current.user), { replace: true });
        }
      }).catch(() => undefined);
      return;
    }
    authApi.verifyEmail(token).then(async () => {
      const current = await authApi.me();
      useAuthStore.setState({ user: current.user });
      setStatus("Email verified. Continue with your academic profile.");
      setBusy(false);
    }).catch(() => {
      setStatus("This verification link is invalid or expired.");
      setBusy(false);
    });
  }, [navigate, token]);

  return <div className="w-full rounded-3xl border bg-white p-8 text-center shadow-xl dark:bg-[#18181b]">
    <h1 className="text-3xl font-black">Verify your email</h1>
    <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{status}</p>
    <div className="mt-6 flex flex-col gap-3">
      {token && !busy && <Button onClick={() => navigate("/onboarding/academic-profile", { replace: true })}>Continue</Button>}
      {email && <Button variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        await authApi.resendEmailVerification(email).catch(() => undefined);
        setStatus("If the account is eligible, a new verification email has been sent.");
        setBusy(false);
      }}>Resend verification email</Button>}
    </div>
  </div>;
}
