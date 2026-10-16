import { useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { CalibrationsTab, CoverageTab } from "@/features/gap-closure";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

type TabId = "coverage" | "calibrations";

export function GapClosurePage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get("tab") === "calibrations" ? "calibrations" : "coverage";
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "coverage", label: t("Coverage checks") },
    { id: "calibrations", label: t("Calibrations") },
  ];

  return (
    <main className="container max-w-6xl py-8">
      <header className="border-b pb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
          <ShieldCheck className="h-4 w-4" />
          {t("Gap Closure Protocol")}
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{t("Coverage and calibration")}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          {t("A gap is called open only when no paper answers the question and the chance of a wrong call is bounded: B = epsHat + pHat. Coverage gives pHat, calibration gives epsHat. Both come from data a person can check.")}
        </p>
      </header>

      <div role="tablist" aria-label={t("Gap Closure Protocol")} className="mt-6 flex gap-1 border-b">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`closure-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`closure-panel-${item.id}`}
            onClick={() => setParams(item.id === "coverage" ? {} : { tab: item.id }, { replace: true })}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`closure-panel-${tab}`} aria-labelledby={`closure-tab-${tab}`} className="mt-6">
        {tab === "coverage" ? <CoverageTab /> : <CalibrationsTab />}
      </div>
    </main>
  );
}
