import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hasMeaningfulResearchText, type AvailableMentor, type InvitationDossierInput, type MentorPlanCandidate } from "@trend/shared-types";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { academicSupportApi, type MentorPreview } from "../api/academic-support.api";
import { mentorshipError } from "./mentoring-preferences";
import { canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";
import { defaultMentorPolicy } from "./mentor-access-workspace";
import { LecturerInvitationCard } from "./lecturer-invitation-card";
import "../supervisor-invitation.css";

type Lecturer = Pick<AvailableMentor, "_id" | "fullName"> & Partial<AvailableMentor>;
type Draft = { summary: string; message: string; signature?: string; key?: string };
type Props = { project: MentorPreview; mentor: Lecturer; onClose: () => void; onSent?: () => void; planned?: { candidate: MentorPlanCandidate; version: number }; application?: { id: string; version: number } };

function recoverDraft(storageKey: string): Draft | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (!value || typeof value.summary !== "string" || !(typeof value.message === "string" || typeof value.reason === "string")) return;
    return { summary: value.summary, message: value.message ?? [value.reason, value.additional].filter(v => typeof v === "string" && v.trim()).join("\n\n"), signature: typeof value.signature === "string" ? value.signature : undefined, key: typeof value.key === "string" ? value.key : undefined };
  } catch { return; }
}
export function SupervisorInvitationForm(props: Props) {
  const actor = useAuthStore(s => s.user?.id);
  return <SupervisorInvitationFormInner key={`${actor}:${props.project.id}:${props.mentor._id}`} {...props} />;
}
function SupervisorInvitationFormInner({ project, mentor, onClose, onSent, planned, application }: Props) {
  const { t } = useI18n(), actor = useAuthStore(s => s.user?.id), cache = useQueryClient();
  const storageKey = `lumigap-supervisor-invite:${actor}:${project.id}:${mentor._id}`;
  const [initial] = useState(() => recoverDraft(storageKey));
  const [draft, setDraft] = useState<Draft>(initial ?? { summary: "", message: "" });
  const [attempted, setAttempted] = useState(false), [saved, setSaved] = useState(false);
  const seeded = useRef(Boolean(initial?.summary)), busy = useRef(false);
  const receipt = useRef<{ signature: string; key: string } | undefined>(initial?.signature && initial.key ? { signature: initial.signature, key: initial.key } : undefined);
  const settings = useQuery({ queryKey: ["academic-support", actor, "discovery-settings", project.id], queryFn: () => academicSupportApi.settings(project.id), retry: false });
  useEffect(() => {
    if (!settings.data || seeded.current) return;
    seeded.current = true;
    setDraft(current => ({ ...current, summary: current.summary || settings.data!.invitationDefaults?.summary || settings.data!.summary || "" }));
  }, [settings.data]);
  useEffect(() => { if (!saved) { try { sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, ...receipt.current })); } catch { /* In-memory recovery remains available. */ } } }, [draft, saved, storageKey]);
  useUnsavedWorkspace(!saved && Boolean(draft.message.trim() || draft.summary !== settings.data?.invitationDefaults?.summary));
  const update = <K extends keyof Draft>(field: K, value: Draft[K]) => { setDraft(current => ({ ...current, [field]: value })); };
  const onlyNumbersAndSymbols = (value: string) => /\p{N}/u.test(value) && !/\p{L}/u.test(value);
  const errors = {
    summary: onlyNumbersAndSymbols(draft.summary) ? t("supervisor.summaryNumbersError") : !hasMeaningfulResearchText(draft.summary) ? t("supervisor.summaryError") : "",
    message: onlyNumbersAndSymbols(draft.message) ? t("supervisor.reasonNumbersError") : !hasMeaningfulResearchText(draft.message) ? t("supervisor.reasonError") : "",
  };
  const context = settings.data?.invitationContext;
  const dossier: InvitationDossierInput = { presentation: "BRIEF", researchSummary: draft.summary.trim(), sharingConfirmed: true, expectations: { supportAreas: [] } };
  const payload = { ...(application ? { applicationId: application.id, expectedApplicationVersion: application.version } : {}), mentorRole: "UNASSIGNED" as const, attachmentIds: [], dossier, access: defaultMentorPolicy(), expectedPreviewToken: context?.token, ...(planned ? { candidateId: planned.candidate.id, expectedPlanVersion: planned.version } : {}) };
  const signature = JSON.stringify({ payload, message: draft.message.trim() });
  const send = useMutation({ mutationFn: async () => {
    if (useAuthStore.getState().user?.id !== actor) throw new Error("Your account changed. Reopen the invitation before continuing.");
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    try { sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, ...receipt.current })); } catch { /* Keep the original request in memory. */ }
    return academicSupportApi.request(project.id, mentor._id, draft.message.trim(), receipt.current.key, payload);
  }, onSuccess: async () => {
    setSaved(true); try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
    await Promise.all([cache.invalidateQueries({ queryKey: ["academic-support"] }), cache.invalidateQueries({ queryKey: ["mentor-workspace"] }), cache.invalidateQueries({ queryKey: ["projects"] })]);
    toast.success(t("supervisor.sent")); onSent?.(); onClose();
  } });
  const close = async () => { if (!send.isPending && !busy.current && await canLeaveWorkspace()) onClose(); };
  const errorFor = (field: keyof typeof errors) => attempted && errors[field] ? <p id={`invite-${field}-error`} className="supervisor-field-error" role="alert">{errors[field]}</p> : null;
  const blocked = send.isPending || settings.isFetching || settings.isError || !context;
  const meta = settings.data ?? project;
  return <Sheet open onOpenChange={open => { if (!open) void close(); }}><SheetContent className="supervisor-invitation-sheet" closeLabel={t("Close")}>
    <header><SheetTitle>{t("supervisor.invite")}</SheetTitle><SheetDescription>{t("supervisor.description")}</SheetDescription></header>
    <form noValidate onSubmit={async e => {
      e.preventDefault(); setAttempted(true);
      if (busy.current || blocked) return;
      if (Object.values(errors).some(Boolean)) { document.getElementById(errors.summary ? "invite-summary" : "invite-message")?.focus(); return; }
      busy.current = true; try { await send.mutateAsync(); } catch { /* Preserve every field for retry. */ } finally { busy.current = false; }
    }}>
      <div className="supervisor-invitation-body">
        <section className="supervisor-context">
          <LecturerInvitationCard mentor={mentor} onChooseAgain={() => void close()} disabled={send.isPending} />
          <div className="supervisor-project-brief"><strong>{context?.title ?? meta.title}</strong><p>{context?.researchField}</p><small>{context?.senderDisplayName} · {context?.memberCount ?? "—"} {t("supervisor.members")}</small></div>
          {/^(?:test|project|dự án)$/i.test((context?.title ?? meta.title).trim()) && <small>{t("supervisor.titleHint")}</small>}
        </section>
        {settings.isLoading && <p role="status">{t("Loading…")}</p>}
        {settings.isError && <div role="alert"><p>{t("supervisor.loadError")}</p><Button type="button" size="sm" variant="outline" onClick={() => void settings.refetch()}>{t("Try again")}</Button></div>}
        <fieldset disabled={send.isPending}>
          <label htmlFor="invite-summary">{t("supervisor.summary")} *<textarea id="invite-summary" autoFocus rows={4} placeholder={t("supervisor.summaryPlaceholder")} maxLength={2000} value={draft.summary} onChange={e => update("summary", e.target.value)} aria-invalid={attempted && !!errors.summary} aria-describedby={attempted && errors.summary ? "invite-summary-error" : undefined} /><small>{t("supervisor.summaryHint")}</small>{errorFor("summary")}</label>
          <label htmlFor="invite-message">{t("supervisor.reason")} *<textarea id="invite-message" rows={4} maxLength={1000} value={draft.message} placeholder={t("supervisor.reasonPlaceholder")} onChange={e => update("message", e.target.value)} aria-invalid={attempted && !!errors.message} aria-describedby={attempted && errors.message ? "invite-message-error" : undefined} />{errorFor("message")}</label>
        </fieldset>
        {send.isError && <p className="supervisor-field-error" role="alert">{t(mentorshipError(send.error))}</p>}
      </div>
      <footer><Button type="button" variant="ghost" disabled={send.isPending} onClick={() => void close()}>{t("Cancel")}</Button><Button type="submit" disabled={blocked}>{send.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t(send.isPending ? "Sending…" : "Send Invitation")}</Button></footer>
    </form>
  </SheetContent></Sheet>;
}
