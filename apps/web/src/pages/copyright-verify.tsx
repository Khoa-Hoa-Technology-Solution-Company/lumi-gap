import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/services/api-client";
import { useI18n } from "@/i18n";

export function CopyrightVerifyPage() {
  const [params] = useSearchParams();
  const { t } = useI18n();
  const token = params.get("token") ?? "";
  // Cache the one-time operation across StrictMode remounts and focus changes.
  const verification = useQuery({ queryKey: ["forum", "copyright-verification", token], queryFn: () => api.post("/forum/copyright-claims/verify", { token }).then(() => true), enabled: Boolean(token), retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const state = !token || verification.isError ? "error" : verification.isSuccess ? "success" : "loading";
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"><h1 className="text-xl font-semibold text-slate-900 dark:text-white">{t("Copyright claim verification")}</h1><p role={state === "error" ? "alert" : "status"} className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t(state === "loading" ? "Verifying your email…" : state === "success" ? "Your claim was received and is ready for review." : "This verification link is invalid or expired.")}</p>{state !== "loading" && <Link className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" to="/forum">{t("Return to Forum")}</Link>}</section></main>;
}
