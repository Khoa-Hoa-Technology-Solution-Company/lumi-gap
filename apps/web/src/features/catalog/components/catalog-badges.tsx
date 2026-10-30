import type { KeywordStatus, PaperTagSource, TagStatus, TaxonomyLevel, TaxonomyNodeStatus } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";

const TONES = {
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  slate: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
} as const;

export const LEVEL_LABELS: Record<TaxonomyLevel, string> = {
  domain: "Domain",
  field: "Field",
  subfield: "Subfield",
  topic: "Topic",
};

const LEVEL_TONES: Record<TaxonomyLevel, keyof typeof TONES> = {
  domain: "violet",
  field: "blue",
  subfield: "green",
  topic: "slate",
};

export function LevelBadge({ level }: { level: TaxonomyLevel }) {
  const { t } = useI18n();
  return <Badge variant="outline" className={TONES[LEVEL_TONES[level]]}>{t(LEVEL_LABELS[level])}</Badge>;
}

const STATUS_LABELS: Record<TaxonomyNodeStatus | KeywordStatus | TagStatus, string> = {
  active: "Active",
  hidden: "Hidden",
  merged: "Merged",
  archived: "Archived",
};

const STATUS_TONES: Record<TaxonomyNodeStatus | KeywordStatus | TagStatus, keyof typeof TONES> = {
  active: "green",
  hidden: "amber",
  merged: "slate",
  archived: "slate",
};

export function StatusBadge({ status }: { status: TaxonomyNodeStatus | KeywordStatus | TagStatus }) {
  const { t } = useI18n();
  return <Badge variant="outline" className={TONES[STATUS_TONES[status]]}>{t(STATUS_LABELS[status])}</Badge>;
}

export const SOURCE_LABELS: Record<PaperTagSource, string> = {
  rule: "Rule",
  embedding: "Embedding",
  manual: "Manual",
  blocked: "Blocked",
};

const SOURCE_TONES: Record<PaperTagSource, keyof typeof TONES> = {
  rule: "blue",
  embedding: "violet",
  manual: "green",
  blocked: "rose",
};

export function SourceBadge({ source }: { source: PaperTagSource }) {
  const { t } = useI18n();
  return <Badge variant="outline" className={TONES[SOURCE_TONES[source]]}>{t(SOURCE_LABELS[source])}</Badge>;
}

export function AliasBadges({ aliases, max = 3 }: { aliases: string[]; max?: number }) {
  if (!aliases.length) return <span className="text-muted-foreground">-</span>;
  const shown = aliases.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((alias) => (
        <Badge key={alias} variant="secondary" className="max-w-[10rem] truncate font-normal">{alias}</Badge>
      ))}
      {aliases.length > max ? <Badge variant="outline" className="font-normal">+{aliases.length - max}</Badge> : null}
    </div>
  );
}
