import type { PaperReadingFacts, PaperReadingGuidance, PaperReadingPurpose, QualityFact } from "@trend/shared-types";
import { useI18n } from "@/i18n";

const PURPOSE_LABEL: Record<PaperReadingPurpose, string> = {
  overview: "Get an overview", method: "Learn the method", data: "Find data",
  results: "See the results", counterpoint: "See a counterpoint", background: "Build background",
};
const AUDIENCE_LABEL: Record<PaperReadingGuidance["audience"], string> = {
  newcomer: "Suited for newcomers", intermediate: "Suited for readers with some background", specialist: "Suited for specialists",
};

/** A fact value with its verbatim quote behind a disclosure, or the explicit "not stated" note. */
function FactValue({ fact }: { fact: QualityFact }) {
  const { t } = useI18n();
  if (fact.status === "not_reported" || !fact.value) return <span className="text-slate-500 dark:text-slate-400">{t("Not stated in the abstract")}</span>;
  return <>
    <span data-no-i18n>{fact.value}</span>
    {fact.status === "unverified" && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{t("Quote could not be verified")}</span>}
    {fact.evidence && <details className="mt-1">
      <summary className="inline-block min-h-6 cursor-pointer rounded-sm text-xs text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300">{t("Show quote")}</summary>
      <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-indigo-300 pl-3 text-xs text-slate-600 dark:border-indigo-700 dark:text-slate-400" data-no-i18n>{fact.evidence.quote}</blockquote>
    </details>}
  </>;
}

function FactList({ title, facts }: { title: string; facts: QualityFact[] }) {
  const { t } = useI18n();
  const reported = facts.filter((fact) => fact.status !== "not_reported" && fact.value);
  return <div className="grid gap-1 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
    <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</dt>
    <dd className="text-sm">{reported.length === 0 ? <span className="text-slate-500 dark:text-slate-400">{t("Not stated in the abstract")}</span> : <ul className="list-disc space-y-2 pl-5">{reported.map((fact, index) => <li key={index}><FactValue fact={fact} /></li>)}</ul>}</dd>
  </div>;
}

export function QualityReadingCard({ facts, guidance }: { facts: PaperReadingFacts; guidance?: PaperReadingGuidance }) {
  const { t } = useI18n();
  const singles: [string, QualityFact][] = [
    [t("Study design"), facts.studyDesign], [t("Sample or data"), facts.sampleOrData],
    [t("Study setting"), facts.setting], [t("Outcome measures"), facts.measures],
  ];
  return <div className="space-y-4">
    <section aria-labelledby="reading-card-title" className="rounded-lg border border-slate-200 p-3 dark:border-slate-800 sm:p-4">
      <h4 id="reading-card-title" className="text-sm font-semibold">{t("Reading card")}</h4>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("Facts below come only from the abstract and title. Open a quote to see the exact words.")}</p>
      <dl className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
        {singles.map(([label, fact]) => <div key={label} className="grid gap-1 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
          <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt><dd className="text-sm"><FactValue fact={fact} /></dd>
        </div>)}
        <FactList title={t("Key results")} facts={facts.keyResults} />
        <FactList title={t("Limitations stated by the authors")} facts={facts.authorStatedLimitations} />
      </dl>
    </section>
    {guidance && <section aria-labelledby="reading-purposes-title" className="space-y-3">
      <h4 id="reading-purposes-title" className="text-sm font-semibold">{t("Read this paper to…")}</h4>
      <ul className="space-y-2">{guidance.purposes.map((item, index) => <li key={index} className="text-sm leading-relaxed"><span className="font-semibold">{t(PURPOSE_LABEL[item.purpose])}</span>{": "}<span data-no-i18n>{item.explanation}</span></li>)}</ul>
      <p className="text-sm leading-relaxed"><span className="font-semibold">{t(AUDIENCE_LABEL[guidance.audience])}</span>{". "}<span data-no-i18n>{guidance.audienceReason}</span></p>
      {guidance.caution && <p className="rounded-md bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><span className="font-semibold">{t("Be careful when citing")}: </span><span data-no-i18n>{guidance.caution}</span></p>}
    </section>}
  </div>;
}
