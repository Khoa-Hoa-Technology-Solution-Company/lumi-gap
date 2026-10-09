import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { GapValidationAction, GapValidationQueueItem, ResearchGapItem } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useAddGapValidation, useGapValidations, useRequestGapValidation } from "../hooks/use-gaps";

/** Statuses after the owner requested validation; validations become visible from then on. */
const SHARED_WITH_EXPERTS = ["UNDER_VALIDATION", "REFINED", "VALIDATED", "REJECTED"];
/** Statuses from which the creator may (re)submit the gap to experts. */
const REQUESTABLE = ["DRAFT", "CANDIDATE", "REFINED"];

export const VALIDATION_ACTIONS: GapValidationAction[] = ["VALIDATE", "CHALLENGE", "REQUEST_EVIDENCE", "SUGGEST_EVIDENCE", "REFINE_SCOPE", "REJECT"];

export function useValidationActionLabels(): Record<GapValidationAction, string> {
  const { t } = useI18n();
  return {
    VALIDATE: t("Validate"),
    CHALLENGE: t("Challenge"),
    REQUEST_EVIDENCE: t("Request evidence"),
    SUGGEST_EVIDENCE: t("Suggest evidence"),
    REFINE_SCOPE: t("Refine scope"),
    REJECT: t("Reject"),
  };
}

function errorMessage(error: unknown) {
  return (error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
}

/** Validation status, the creator's request button and the experts' decisions, shown in the gap drawer. */
export function GapExpertValidationPanel({ gap }: { gap: ResearchGapItem }) {
  const { t } = useI18n();
  const labels = useValidationActionLabels();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const status = gap.validationStatus ?? "CANDIDATE";
  const shared = SHARED_WITH_EXPERTS.includes(status);
  const validations = useGapValidations(gap.id, shared);
  const request = useRequestGapValidation();
  const canRequest = currentUserId === gap.userId && REQUESTABLE.includes(status);

  const requestValidation = async () => {
    try {
      await request.mutateAsync(gap.id);
      toast.success(t("Validation requested. Verified experts can now review this gap."));
    } catch (error) {
      toast.error(errorMessage(error) || t("Could not request expert validation."));
    }
  };

  return (
    <div className="space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("Expert validation")}</h3>
        <Badge variant="outline" className="text-[10px] uppercase">{status.replaceAll("_", " ")}</Badge>
      </div>
      {canRequest && (
        <div className="rounded-xl border border-dashed border-slate-200 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <p>{t("Requesting validation shares this gap and its linked evidence with verified experts who hold research-gap validation rights.")}</p>
          <Button size="sm" variant="outline" className="mt-3 h-8 gap-1.5 text-xs" disabled={request.isPending} onClick={() => void requestValidation()}>
            {request.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {t("Request expert validation")}
          </Button>
        </div>
      )}
      {shared && (validations.isLoading ? (
        <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
      ) : validations.data?.length ? (
        <ul className="space-y-2">
          {validations.data.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200/70 p-3 text-xs dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="secondary" className="text-[10px]">{labels[item.action] ?? item.action}</Badge>
                <span className="text-slate-500">{item.reviewerId?.fullName ?? t("Expert")} · {new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="mt-2 leading-relaxed text-slate-700 dark:text-slate-300">{item.comment}</p>
              {item.suggestedChanges ? <p className="mt-1 leading-relaxed text-slate-500">{item.suggestedChanges}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{t("No expert decisions yet.")}</p>
      ))}
    </div>
  );
}

/** Decision form an expert fills in for one queued gap. */
export function GapValidationDecisionForm({ gap, onDone }: { gap: GapValidationQueueItem; onDone?: () => void }) {
  const { t } = useI18n();
  const labels = useValidationActionLabels();
  const addValidation = useAddGapValidation();
  const [action, setAction] = useState<GapValidationAction>("VALIDATE");
  const [comment, setComment] = useState("");
  const [suggestedChanges, setSuggestedChanges] = useState("");
  const canSubmit = comment.trim().length >= 10 && !addValidation.isPending;

  const submit = async () => {
    try {
      await addValidation.mutateAsync({ gapId: gap.id, payload: { action, comment: comment.trim(), suggestedChanges: suggestedChanges.trim() || undefined } });
      toast.success(t("Validation decision recorded."));
      setComment("");
      setSuggestedChanges("");
      onDone?.();
    } catch (error) {
      toast.error(errorMessage(error) || t("Could not record the validation decision."));
    }
  };

  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-xs font-semibold">
        <span>{t("Decision")}</span>
        <select value={action} onChange={(event) => setAction(event.target.value as GapValidationAction)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
          {VALIDATION_ACTIONS.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-xs font-semibold">
        <span>{t("Comment (at least 10 characters)")}</span>
        <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} className="w-full rounded-md border bg-background p-2 text-sm" />
      </label>
      <label className="block space-y-1 text-xs font-semibold">
        <span>{t("Suggested changes (optional)")}</span>
        <textarea rows={2} value={suggestedChanges} onChange={(event) => setSuggestedChanges(event.target.value)} className="w-full rounded-md border bg-background p-2 text-sm" />
      </label>
      <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
        {addValidation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {t("Record decision")}
      </Button>
    </div>
  );
}
