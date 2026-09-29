import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/features/auth";
import { useI18n } from "@/i18n";

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestFailed, setRequestFailed] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const requestResetLink = async () => {
    if (isSubmitting || !email.trim()) return;
    setIsSubmitting(true);
    setRequestMessage("");
    setRequestFailed(false);
    let cooldownSeconds = 60;
    try {
      await authApi.forgotPassword(email.trim());
      setRequestMessage(t("If an active account exists for that address, check your inbox and spam folder. Only the newest reset link will work."));
    } catch (error) {
      setRequestFailed(true);
      const response = (error as { response?: { status?: number; headers?: Record<string, unknown> } }).response;
      const status = response?.status;
      const retryAfterSeconds = Number(response?.headers?.["retry-after"]);
      if (status === 429) cooldownSeconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds) : 3600;
      setRequestMessage(t(status === 429
        ? "For your security, wait before requesting another reset link."
        : "We couldn't process that request right now. Please wait a moment and try again."));
    } finally {
      setSubmitted(true);
      setResendCooldown(cooldownSeconds);
      setIsSubmitting(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void requestResetLink();
  };

  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-xl dark:border-slate-800 dark:bg-[#18181b] sm:p-8">
      {submitted ? (
        <div className="text-center">
          <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${requestFailed ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"}`}>
            {requestFailed ? <Mail className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
          </div>
          <h1 className="mt-5 text-2xl font-black text-slate-900 dark:text-white">{requestFailed ? t("Request not completed") : t("Check your email")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400" role="status" aria-live="polite">{requestMessage}</p>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{t("The link expires in 30 minutes. If you request another, older links stop working.")}</p>
          <div className="mt-6 space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">{t("Didn't receive the email? Check your spam folder or resend the link.")}</p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isSubmitting || resendCooldown > 0}
              onClick={() => void requestResetLink()}
            >
              {isSubmitting
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("Sending...")}</>
                : resendCooldown > 0
                  ? resendCooldown >= 60
                    ? t("Resend in {{minutes}}m", { minutes: Math.ceil(resendCooldown / 60) })
                    : t("Resend in {{seconds}}s", { seconds: resendCooldown })
                  : <><RefreshCw className="mr-2 h-4 w-4" />{t("Resend reset link")}</>}
            </Button>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setRequestMessage("");
                setRequestFailed(false);
                setResendCooldown(0);
              }}
              className="w-full text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
            >
              {t("Try another email")}
            </button>
          </div>
          <Button className="mt-4 w-full" variant="ghost" asChild><Link to="/login">{t("Back to sign in")}</Link></Button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"><Mail className="h-5 w-5" /></div>
          <h1 className="mt-5 text-2xl font-black text-slate-900 dark:text-white">{t("Forgot your password?")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{t("Enter your account email and we will send you a secure reset link.")}</p>
          <div className="mt-6 space-y-2">
            <Label htmlFor="reset-email">{t("Email address")}</Label>
            <Input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoFocus />
          </div>
          <Button className="mt-5 w-full" type="submit" disabled={isSubmitting || !email.trim()}>{isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("Sending...")}</> : t("Send reset link")}</Button>
          <Link to="/login" className="mt-5 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400"><ArrowLeft className="h-4 w-4" />{t("Back to sign in")}</Link>
        </form>
      )}
    </div>
  );
}
