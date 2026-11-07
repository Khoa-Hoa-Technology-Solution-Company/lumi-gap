import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { useCompleteOrcidConnection } from "@/features/academic-profile/hooks/use-academic-profile";

const SAFE_RETURN_PATHS = new Set([
  "/profile",
  "/profile?edit=link",
  "/settings/profile",
  "/onboarding/academic-profile",
]);

export function OrcidCallbackPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const completeOrcid = useCompleteOrcidConnection();
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Strip authorization code and state from browser history immediately.
    window.history.replaceState(window.history.state, "", window.location.pathname);

    const oauthError = params.get("error");
    const code = params.get("code");
    const state = params.get("state");

    if (oauthError) {
      void completeOrcid.mutateAsync({ error: oauthError, state: state ?? undefined }).catch(() => undefined);
      setError(
        oauthError === "access_denied"
          ? t("ORCID authorization was cancelled.")
          : t("Could not connect ORCID. Please try again."),
      );
      return;
    }

    if (!code || !state) {
      setError(t("ORCID connection expired. Please try connecting again."));
      return;
    }

    let live = true;
    void completeOrcid
      .mutateAsync({ code, state })
      .then((result) => {
        if (!live) return;
        const target = SAFE_RETURN_PATHS.has(result.returnTo) ? result.returnTo : "/profile";
        const separator = target.includes("?") ? "&" : "?";
        navigate(`${target}${separator}orcid=connected`, { replace: true });
      })
      .catch((err: unknown) => {
        if (!live) return;
        const response = err as { response?: { data?: { error?: { message?: string } } } };
        setError(response.response?.data?.error?.message ?? t("Could not connect ORCID. Please try again."));
      });

    return () => {
      live = false;
    };
  }, [completeOrcid, navigate, params, t]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6" data-no-i18n>
      <h1 className="text-xl font-semibold">{t("ORCID connection")}</h1>
      {error ? (
        <>
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Link to="/profile" className="text-sm font-medium underline underline-offset-4">
            {t("Back to profile")}
          </Link>
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {t("Connecting ORCID…")}
        </p>
      )}
    </main>
  );
}

