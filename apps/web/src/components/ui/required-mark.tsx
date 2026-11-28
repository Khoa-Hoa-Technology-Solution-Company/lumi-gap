import { useI18n } from "@/i18n";

export function RequiredMark() {
  const { t } = useI18n();
  return (
    <>
      <span className="ml-0.5 text-destructive" aria-hidden="true">
        *
      </span>
      <span className="sr-only"> ({t("bắt buộc")})</span>
    </>
  );
}

export function FormRequiredLegend({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      {t("Các trường có dấu")} <span className="font-semibold text-destructive" aria-hidden="true">*</span>{" "}
      {t("là bắt buộc.")}
    </p>
  );
}
