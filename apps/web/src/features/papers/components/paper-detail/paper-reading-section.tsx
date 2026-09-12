import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Cpu,
  Globe,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Paper, PaperAiAnalysis, PaperKeyword, PaperTopic } from "@trend/shared-types";
import { formatLanguageName } from "@/utils/language";

export interface PaperReadingSectionProps {
  paper: Paper;
  displayAbstract?: string;
  showTranslation: boolean;
  translationLanguage?: string;
  translationSourceLanguage?: string;
  translationProvider?: string;
  onToggleTranslation: () => void;
}

export function formatTranslationSourceLabel(sourceLanguage?: string): string {
  return sourceLanguage?.trim()
    ? formatLanguageName(sourceLanguage)
    : "the original language";
}

export function PaperReadingSection({
  paper,
  displayAbstract,
  showTranslation,
  translationLanguage,
  translationSourceLanguage,
  translationProvider = "AI Translator",
  onToggleTranslation,
}: PaperReadingSectionProps) {
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false);

  const abstractText = displayAbstract || paper.abstractText;
  const isLongAbstract = abstractText && abstractText.length > 500;
  const topics = paper.topics ?? [];
  const keywords = paper.keywords ?? [];
  const aiAnalysis = paper.aiAnalysis;

  return (
    <section aria-labelledby="reading-section-title" className="space-y-6">
      <h2 id="reading-section-title" className="sr-only">
        Paper Reading and Knowledge
      </h2>

      {/* Abstract Block */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Abstract
          </h3>
        </div>

        {abstractText ? (
          <div className="space-y-3">
            <div className="relative">
              <p
                className={`text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-medium ${
                  isLongAbstract && !isAbstractExpanded ? "line-clamp-4" : ""
                }`}
              >
                {abstractText}
              </p>
            </div>

            {isLongAbstract && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAbstractExpanded((prev) => !prev)}
                className="h-7 px-2 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                {isAbstractExpanded ? (
                  <>
                    Show less <ChevronUp className="ml-1 h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    Read full abstract <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm italic text-slate-400">
            No abstract available for this work.
          </p>
        )}

        {/* Translation Provenance Banner */}
        {showTranslation && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>
                Translated from {formatTranslationSourceLabel(translationSourceLanguage)} to{" "}
                <strong>{formatLanguageName(translationLanguage || "vi")}</strong> by{" "}
                <strong>{translationProvider}</strong>; original available.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleTranslation}
              className="h-7 text-xs font-bold border-blue-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
            >
              View original {formatTranslationSourceLabel(translationSourceLanguage)}
            </Button>
          </div>
        )}
      </div>

      {/* Research Topics and Keywords */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-4">
        <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Tag className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          Research topics and keywords
        </h3>

        <div className="space-y-4">
          {/* Topics -> Trends */}
          {topics.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Research Topics
              </span>
              <div className="flex flex-wrap gap-2">
                {topics.map((tItem: PaperTopic) => {
                  const topicName = tItem.topicName;
                  return (
                    <Link
                      key={tItem.topicId || tItem.openalexTopicId || topicName}
                      to={`/trends/${encodeURIComponent(topicName)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200/60 bg-blue-50/70 px-3 py-1 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100 hover:border-blue-300 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                    >
                      {topicName}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Keywords -> Search */}
          {keywords.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Keywords
              </span>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw: PaperKeyword) => (
                  <Link
                    key={kw.keywordId || kw.keywordName}
                    to={`/search?q=${encodeURIComponent(kw.keywordName)}`}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    #{kw.keywordName}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {topics.length === 0 && keywords.length === 0 && (
            <p className="text-xs italic text-slate-400">
              No topics or keywords recorded for this work.
            </p>
          )}
        </div>
      </div>

      {/* Structured Paper Knowledge */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-4">
        <div>
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Cpu className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            Structured paper knowledge
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Extracted once from the title and abstract. Empty fields remain unavailable rather than inferred.
          </p>
        </div>

        <KnowledgeGrid aiAnalysis={aiAnalysis} />
      </div>
    </section>
  );
}

function formatArrayField(val?: string[] | string | null): string | undefined {
  if (!val) return undefined;
  if (Array.isArray(val)) return val.length > 0 ? val.join("; ") : undefined;
  return val;
}

function KnowledgeGrid({ aiAnalysis }: { aiAnalysis?: PaperAiAnalysis }) {
  const fields = [
    { label: "Summary", value: aiAnalysis?.summary },
    { label: "Core Methods", value: aiAnalysis?.methods },
    { label: "Main Findings", value: formatArrayField(aiAnalysis?.findings) },
    { label: "Key Contributions", value: formatArrayField(aiAnalysis?.contributions) },
    { label: "Limitations", value: formatArrayField(aiAnalysis?.limitations) },
    { label: "Dataset / Tooling", value: aiAnalysis?.dataset },
    { label: "Future Work", value: formatArrayField(aiAnalysis?.futureWork) },
    { label: "Key Terms", value: formatArrayField(aiAnalysis?.keyTerms) },
  ];

  const hasAnyField = fields.some((f) => Boolean(f.value));

  if (!hasAnyField) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
        Structured knowledge extractions are not available for this work yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map((f) => (
        <div
          key={f.label}
          className="rounded-xl border border-slate-200/60 bg-slate-50/40 p-4 dark:border-slate-800/60 dark:bg-slate-900/30 space-y-1"
        >
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
            {f.label}
          </span>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {f.value || <span className="italic text-slate-400">Unavailable</span>}
          </p>
        </div>
      ))}
    </div>
  );
}
