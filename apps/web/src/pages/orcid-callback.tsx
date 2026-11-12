import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { academicProfileApi } from "@/features/academic-profile/api/academic-profile.api";
import { orcidPendingKey } from "@/features/academic-profile/orcid-authorization";

export function OrcidCallbackPage() {
  const { t } = useI18n(), cache = useQueryClient(), userId = useAuthStore(state => state.user?.id);
  const [parameters] = useState(() => new URLSearchParams(window.location.search));
  const pending = useRef<{ state?: string; userId?: string; createdAt?: number } | null>();
  const request = useRef<{ userId: string; promise: ReturnType<typeof academicProfileApi.completeOrcid> }>();
  const [outcome, setOutcome] = useState<"pending" | "connected" | "cancelled" | "failed" | "duplicate">("pending");
  useEffect(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (pending.current === undefined) { try { pending.current = JSON.parse(sessionStorage.getItem(orcidPendingKey) ?? "null"); } catch { pending.current = null; } }
    const state = parameters.get("state"), code = parameters.get("code"), error = parameters.get("error");
    if (!userId || pending.current?.userId !== userId || pending.current.state !== state || !pending.current.createdAt || Date.now() - pending.current.createdAt >= 600000 || !state || parameters.getAll("state").length !== 1 || parameters.getAll("code").length > 1 || parameters.getAll("error").length > 1 || Boolean(code) === Boolean(error)) { setOutcome("failed"); return; }
    if (!request.current) {
      sessionStorage.removeItem(orcidPendingKey);
      request.current = { userId, promise: academicProfileApi.completeOrcid({ state, ...(error ? { error } : { code: code! }) }) };
    }
    if (request.current.userId !== userId) { setOutcome("failed"); return; }
    let live = true;
    void request.current.promise.then(async result => {
      await cache.invalidateQueries({ queryKey: ["academic-profile"] });
      if (live) setOutcome(result.cancelled ? "cancelled" : "connected");
    }).catch(error => { if (live) setOutcome(error?.response?.status === 409 ? "duplicate" : "failed"); });
    return () => { live = false; };
  }, [cache, parameters, userId]);
  const labels = {
    pending: "Completing ORCID connection…", connected: "ORCID connected. You can manage its visibility in your academic profile.",
    cancelled: "ORCID authorization was cancelled. Your existing profile is unchanged.",
    failed: "ORCID connection failed or expired. Return to your profile and try again with the original LumiGap account.",
    duplicate: "ORCID is already linked or your profile changed. Review your identities and start again.",
  };
  return <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-6" data-no-i18n><h1 className="text-xl font-semibold">{t("ORCID account connection")}</h1><p role={outcome === "failed" || outcome === "duplicate" ? "alert" : "status"}>{t(labels[outcome])}</p><p className="text-sm text-muted-foreground">{t("ORCID ownership does not verify lecturer status, affiliation or research expertise.")}</p><Link className="text-primary underline" to="/profile">{t("Back to academic profile")}</Link></main>;
}
