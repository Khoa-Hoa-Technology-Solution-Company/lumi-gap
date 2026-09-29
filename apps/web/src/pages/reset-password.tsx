import { useMemo, useState, type FormEvent } from "react";
import { Check, CheckCircle2, KeyRound, Loader2, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authApi } from "@/features/auth";
import { PasswordInput } from "@/features/auth/components/password-input";
import { checkPasswordPolicy } from "@/features/auth/utils/password-policy";
import { useI18n } from "@/i18n";

export function ResetPasswordPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const policy = useMemo(() => checkPasswordPolicy(password), [password]);
  const passwordsMatch = password.length > 0 && password === confirmation;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!token) return setMessage(t("This password reset link is incomplete."));
    if (!policy.valid) return setMessage(t("Your password does not meet all requirements."));
    if (!passwordsMatch) return setMessage(t("Passwords do not match."));
    setIsSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setCompleted(true);
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 429) {
        setMessage(t("Too many password reset attempts. Please wait before trying again."));
      } else if (status === 400 || status === 401) {
        setMessage(`${t("This password reset link is no longer valid.")} ${t("It may have expired or a newer reset link was requested.")}`);
      } else {
        setMessage(t("We couldn't update the password right now. Please try again."));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (completed) {
    return (
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl dark:border-slate-800 dark:bg-[#18181b]" role="status" aria-live="polite">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"><CheckCircle2 className="h-6 w-6" /></div>
        <h1 className="mt-5 text-2xl font-black text-slate-900 dark:text-white">{t("Password updated")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{t("Your password has been changed. For security, existing sessions have been signed out.")}</p>
        <Button className="mt-6 w-full" asChild><Link to="/login">{t("Sign in with new password")}</Link></Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-xl dark:border-slate-800 dark:bg-[#18181b] sm:p-8">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"><KeyRound className="h-5 w-5" /></div>
      <h1 className="mt-5 text-2xl font-black text-slate-900 dark:text-white">{t("Choose a new password")}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{t("Use a strong password you do not use on other services.")}</p>

      {!token && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">{t("This password reset link is incomplete.")}</div>}

      <div className="mt-6 space-y-2">
        <Label htmlFor="new-password">{t("New password")}</Label>
        <PasswordInput id="new-password" autoComplete="new-password" maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="confirm-password">{t("Confirm new password")}</Label>
        <PasswordInput id="confirm-password" autoComplete="new-password" maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      </div>

      <ul className="mt-4 grid gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Requirement met={policy.checks.minimumLength} label={t("At least 10 characters")} />
        <Requirement met={policy.checks.maximumLength} label={t("No more than 128 characters")} />
        <Requirement met={policy.checks.uppercase && policy.checks.lowercase} label={t("Uppercase and lowercase letters")} />
        <Requirement met={policy.checks.number} label={t("At least one number")} />
        {confirmation && <Requirement met={passwordsMatch} label={t("Passwords match")} />}
      </ul>

      {message && <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400" role="alert">{message}</p>}
      <Button className="mt-5 w-full" type="submit" disabled={isSubmitting || !token || !policy.valid || !passwordsMatch}>{isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("Updating...")}</> : t("Update password")}</Button>
      <Link to="/forgot-password" className="mt-4 block text-center text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">{t("Request a new reset link")}</Link>
    </form>
  );
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  const Icon = met ? Check : X;
  return <li className={met ? "flex items-center gap-2 text-emerald-700 dark:text-emerald-400" : "flex items-center gap-2"}><Icon className="h-3.5 w-3.5" />{label}</li>;
}
