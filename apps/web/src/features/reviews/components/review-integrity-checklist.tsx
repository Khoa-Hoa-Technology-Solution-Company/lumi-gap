import { ShieldCheck } from "lucide-react";
import { scientificIntegrityChecks, type AcademicReviewInput } from "@trend/shared-types";
import { useI18n } from "@/i18n";

type Checks = NonNullable<AcademicReviewInput["integrityChecks"]>;

export function ReviewIntegrityChecklist({ value, onChange, disabled, variant }: {
  variant?: "workspace" | "readonly";
  value: Checks;
  onChange: (value: Checks) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const checkedCount = scientificIntegrityChecks.filter(c => value[c.key]?.status).length;

  if (variant === "readonly") return <ul className="divide-y rounded-md border">{scientificIntegrityChecks.map(check => { const entry = value[check.key]; return <li key={check.key} className="space-y-1 p-3 text-sm"><strong>{t(check.title)}</strong><p>{t(entry?.status === "CHECKED" ? "reviewWorkspace.integrity.checked" : entry?.status === "CONCERN" ? "reviewWorkspace.integrity.concern" : entry?.status === "NOT_APPLICABLE" ? "reviewWorkspace.integrity.notApplicable" : "Not assessed")}</p>{entry?.status === "CONCERN" && entry.note && <p className="whitespace-pre-wrap">{entry.note}</p>}</li>; })}</ul>;

  return (
    <section id="review-integrity" data-no-i18n className="rw-card scroll-mt-24">
      <details open={checkedCount > 0}>
        <summary className="rw-card-summary">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="rw-step-badge" data-done={checkedCount === scientificIntegrityChecks.length ? "true" : undefined}>
              <ShieldCheck size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">{t("reviewWorkspace.integrityTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("reviewWorkspace.integrityHint")}</p>
            </div>
          </div>
          <span className="rw-progress-chip">
            {checkedCount}/{scientificIntegrityChecks.length}
          </span>
        </summary>
        <div className="rw-card-body space-y-3">
          {scientificIntegrityChecks.map(check => (
            <div className="rw-integrity-item" key={check.key}>
              <label className="block text-sm font-medium text-foreground">
                <span>{t(check.title)}</span>
                <select
                  disabled={disabled}
                  className="mt-1.5 h-9 w-full rounded-md border bg-background px-3 text-sm font-normal"
                  value={value[check.key]?.status ?? ""}
                  onChange={e => {
                    if (!e.target.value) {
                      const next = { ...value };
                      delete next[check.key];
                      onChange(next);
                    } else {
                      onChange({
                        ...value,
                        [check.key]: {
                          ...value[check.key],
                          status: e.target.value as Checks[string]["status"],
                        },
                      });
                    }
                  }}
                >
                  <option value="">{t("Not assessed")}</option>
                  <option value="CHECKED">{t("reviewWorkspace.integrity.checked")}</option>
                  <option value="CONCERN">{t("reviewWorkspace.integrity.concern")}</option>
                  {check.allowNotApplicable ? (
                    <option value="NOT_APPLICABLE">{t("reviewWorkspace.integrity.notApplicable")}</option>
                  ) : null}
                </select>
              </label>
              {value[check.key]?.status === "CONCERN" ? (
                <textarea
                  aria-label={`${t(check.title)} note`}
                  disabled={disabled}
                  maxLength={2000}
                  placeholder={t("reviewWorkspace.integrity.notePlaceholder")}
                  className="mt-2 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={value[check.key]?.note ?? ""}
                  onChange={e =>
                    onChange({
                      ...value,
                      [check.key]: { ...value[check.key]!, note: e.target.value },
                    })
                  }
                />
              ) : null}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
