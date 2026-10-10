import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { academicSupportApi } from "../api/academic-support.api";
import type { MentoringPreferences } from "@trend/shared-types";

export function mentorshipError(error: unknown) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Could not complete this action. Please try again.";
}
export function useMentoringPreferences() {
  return useQuery({ queryKey: ["academic-support", "preferences"], queryFn: academicSupportApi.preferences });
}
export function MentoringPreferencesPanel({ lecturer = true }: { lecturer?: boolean }) {
  const { t, language } = useI18n(), cache = useQueryClient(), preferences = useMentoringPreferences();
  const update = useMutation({ mutationFn: (input: Partial<Omit<MentoringPreferences, "canEnable">>) => academicSupportApi.savePreferences({ ...input, locale: language === "vi" ? "vi" : "en" }),
    onSuccess: result => { cache.setQueryData(["academic-support", "preferences"], result); void cache.invalidateQueries({ queryKey: ["academic-profile"] }); void cache.invalidateQueries({ queryKey: ["academic-support", "opportunities"] }); } });
  if (preferences.isLoading) return <p role="status">{t("Loading…")}</p>;
  if (!preferences.data) return <p role="alert">{t("Unable to load mentoring preferences.")}</p>;
  const pref = preferences.data;
  return <section className="space-y-4 rounded-lg border bg-card p-4" data-no-i18n>
    {lecturer && <div><h3 className="text-sm font-semibold">{t("Mentoring availability")}</h3>{pref.canEnable ? <>
      <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 text-sm"><span>{t("Open to mentoring new teams")}</span><span className="relative inline-flex h-5 w-9 shrink-0">
        <input type="checkbox" role="switch" aria-label={t("Open to mentoring new teams")} checked={pref.acceptingMentorships} disabled={update.isPending} onChange={e => update.mutate({ acceptingMentorships: e.target.checked })} className="peer sr-only" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full bg-muted-foreground/40 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 motion-reduce:transition-none" />
        <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50 motion-reduce:transition-none" />
      </span></label>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{t(pref.acceptingMentorships ? "Teams may discover your profile and send mentorship requests." : "You're not currently accepting new mentorship requests. Existing mentorships are not affected.")}</p>
    </> : <><p className="mt-2 text-sm text-muted-foreground">{t("Lecturer verification is required before accepting official mentorships.")}</p><Button size="sm" variant="outline" className="mt-3" asChild><Link to="/settings/verification/lecturer">{t("Verify Lecturer Status")}</Link></Button></>}</div>}
    <label className="flex items-center justify-between gap-4 text-sm"><span>{t("Email for mentorship invitations and decisions")}</span><input type="checkbox" checked={pref.emailEnabled} disabled={update.isPending} onChange={e => update.mutate({ emailEnabled: e.target.checked })} className="h-4 w-4 accent-primary" /></label>
    {update.error && <p role="alert" className="text-sm text-destructive">{t(mentorshipError(update.error))}</p>}
  </section>;
}
