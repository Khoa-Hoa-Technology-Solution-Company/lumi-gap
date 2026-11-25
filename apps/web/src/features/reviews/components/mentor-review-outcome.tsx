import type { OverallAcademicAssessment } from "@trend/shared-types";
import { useI18n } from "@/i18n";

export function MentorReviewOutcome({ commentOnly, assessment, disabled, onChange }: {
  commentOnly: boolean; assessment?: OverallAcademicAssessment; disabled: boolean;
  onChange: (commentOnly: boolean, assessment?: OverallAcademicAssessment) => void;
}) {
  const { t } = useI18n();
  const selected = commentOnly ? "COMMENT" : assessment === "STRONG" ? "APPROVE" : assessment ? "CHANGES" : "";
  const options = [
    { value: "COMMENT", label: "comment", hint: "commentHint" },
    { value: "CHANGES", label: "changes", hint: "changesHint" },
    { value: "APPROVE", label: "approve", hint: "approveHint" },
  ] as const;
  return <fieldset className="mt-5" disabled={disabled}><legend className="text-sm font-medium">{t("mentorWorkspace.outcome")}</legend>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">{options.map(option => <label key={option.value} className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${selected === option.value ? "border-primary bg-primary/5" : "border-border"}`}>
      <input className="mt-1 accent-primary" type="radio" name="mentor-feedback-outcome" value={option.value} checked={selected === option.value} onChange={() => onChange(option.value === "COMMENT", option.value === "APPROVE" ? "STRONG" : option.value === "CHANGES" ? "MINOR_REVISION" : undefined)} />
      <span><strong className="block font-medium">{t(`mentorWorkspace.outcome.${option.label}`)}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(`mentorWorkspace.outcome.${option.hint}`)}</span></span>
    </label>)}</div>
    {selected === "CHANGES" && <label className="mt-3 block text-sm">{t("mentorWorkspace.revisionLevel")}<select className="ml-3 h-9 rounded-md border bg-background px-3" value={assessment} onChange={e => onChange(false, e.target.value as OverallAcademicAssessment)}><option value="MINOR_REVISION">{t("Minor revision")}</option><option value="MAJOR_REVISION">{t("Major revision")}</option><option value="NOT_READY">{t("Not ready")}</option></select></label>}
  </fieldset>;
}
