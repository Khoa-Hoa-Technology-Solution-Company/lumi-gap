import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Mail, UserCheck } from "lucide-react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { academicSupportApi } from "../api/academic-support.api";
import type { MentoringPreferences } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";

export function mentorshipError(error: unknown) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Could not complete this action. Please try again.";
}

export function useMentoringPreferences() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({ queryKey: ["academic-support", userId, "preferences"], queryFn: academicSupportApi.preferences });
}

export function MentoringPreferencesPanel({ lecturer = true, plain = false }: { lecturer?: boolean; plain?: boolean }) {
  const { t, language } = useI18n(), cache = useQueryClient(), preferences = useMentoringPreferences();
  const userId = useAuthStore(s => s.user?.id);
  const update = useMutation({
    mutationFn: (input: Partial<Pick<MentoringPreferences, "acceptingMentorships" | "emailEnabled" | "locale">>) =>
      academicSupportApi.savePreferences({ ...input, locale: language === "vi" ? "vi" : "en" }),
    onSuccess: result => {
      cache.setQueryData(["academic-support", userId, "preferences"], result);
      void cache.invalidateQueries({ queryKey: ["academic-profile"] });
      void cache.invalidateQueries({ queryKey: ["academic-support", userId, "opportunities"] });
    },
  });

  if (preferences.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("Loading…")}</p>;
  if (!preferences.data) return <p role="alert" className="text-sm text-destructive">{t("Unable to load mentoring preferences.")}</p>;
  const pref = preferences.data;

  return (
    <section
      className={plain ? "space-y-3" : "space-y-4 rounded-xl border bg-card p-4"}
      data-no-i18n
    >
      {lecturer ? (
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
          {pref.canEnable ? (
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <UserCheck size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{t("Open to mentoring new teams")}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {t(
                      pref.acceptingMentorships
                        ? "Teams may discover your profile and send mentorship requests."
                        : "You're not currently accepting new mentorship requests. Existing mentorships are not affected.",
                    )}
                  </span>
                </div>
              </div>
              <span className="relative mt-1 inline-flex h-5 w-9 shrink-0">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={t("Open to mentoring new teams")}
                  checked={pref.acceptingMentorships}
                  disabled={update.isPending}
                  onChange={e => update.mutate({ acceptingMentorships: e.target.checked })}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full bg-muted-foreground/40 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 motion-reduce:transition-none"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50 motion-reduce:transition-none"
                />
              </span>
            </label>
          ) : (
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold">{t("Mentoring availability")}</h3>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("Lecturer verification is required before accepting official mentorships.")}
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link to="/settings/verification/lecturer">{t("Verify Lecturer Status")}</Link>
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                {t("Email for mentorship invitations and decisions")}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {language === "vi"
                  ? "Nhận email khi có nhóm nghiên cứu gửi lời mời hoặc cập nhật trạng thái hướng dẫn."
                  : "Receive emails when research teams send invitations or update mentorship decisions."}
              </span>
            </div>
          </div>
          <span className="relative mt-1 inline-flex h-5 w-9 shrink-0">
            <input
              type="checkbox"
              role="switch"
              aria-label={t("Email for mentorship invitations and decisions")}
              checked={pref.emailEnabled}
              disabled={update.isPending}
              onChange={e => update.mutate({ emailEnabled: e.target.checked })}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full bg-muted-foreground/40 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 motion-reduce:transition-none"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50 motion-reduce:transition-none"
            />
          </span>
        </label>
      </div>

      {pref.emailDelivery ? (
        <p role="status" className="break-words text-xs leading-5 text-muted-foreground">
          {t(pref.emailDelivery.status === "TEST_ADDRESS"
            ? "The account uses test address {{email}}, which cannot receive messages in a real inbox."
            : pref.emailDelivery.status === "NOT_CONFIGURED"
              ? "Email delivery is not enabled on this server. Your preference is saved, but messages cannot be sent yet."
              : pref.emailEnabled
                ? "New mentorship invitations and decisions will be emailed to {{email}}."
                : "Email notifications are off. Enable them to receive new mentorship invitations and decisions at {{email}}.",
          { email: pref.emailDelivery.recipient })}
        </p>
      ) : null}

      {update.error ? <p role="alert" className="text-sm text-destructive">{t(mentorshipError(update.error))}</p> : null}
    </section>
  );
}
