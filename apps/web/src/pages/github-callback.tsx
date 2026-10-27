import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { githubConnectionApi } from "@/features/manuscripts/github-connection.api";

export function GithubCallbackPage() {
  const { t } = useI18n(), navigate = useNavigate(), userId = useAuthStore(state => state.user?.id);
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [error, setError] = useState("");
  const request = useRef<{ userId: string; promise: Promise<{ returnTo: string }> }>();
  useEffect(() => {
    // Remove temporary authorization codes before navigation or other requests.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (params.has("error")) { setError(t("GitHub authorization was cancelled. Your manuscript is retained.")); return; }
    const code = params.get("code"), state = params.get("state");
    if (!userId || !code || !state) { setError(t("GitHub connection expired. Return to your manuscript and connect again with the original LumiGap account.")); return; }
    if (!request.current) request.current = { userId, promise: githubConnectionApi.complete(userId, code, state) };
    if (request.current.userId !== userId) { setError(t("GitHub connection expired. Return to your manuscript and connect again with the original LumiGap account.")); return; }
    let live = true;
    void request.current.promise.then(result => {
      if (!/^\/projects\/[a-fA-F0-9-]{24,36}(?:\/manuscripts\/[a-fA-F0-9-]{36}|\?tab=manuscripts)?$/.test(result.returnTo)) throw new Error();
      if (live) navigate(result.returnTo, { replace: true, state: { githubConnected: true } });
    }).catch(() => { if (live) setError(t("GitHub connection failed. Retry or reconnect; your manuscript is retained.")); });
    return () => { live = false; };
  }, [navigate, params, t, userId]);
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6" data-no-i18n><h1 className="text-xl font-semibold">{t("GitHub connection")}</h1>{error ? <><p role="alert">{error}</p><Link to="/projects">{t("Back to projects")}</Link></> : <p role="status">{t("Completing GitHub connection…")}</p>}</main>;
}
