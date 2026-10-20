import type { GapClosureStatus } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { closureBadgeSpec, type ClosureTone } from "../closure-format";

const TONE_CLASS: Record<ClosureTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
  closed: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  open: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

interface ClosureStatusBadgeProps {
  status?: GapClosureStatus;
  /** False-novelty bound B of the decided check (0..1); shown as a percentage for OPEN_CERTIFIED. */
  bound?: number | null;
  className?: string;
}

/** Result of the Gap Closure Protocol for one gap: not checked, already answered, open (certified) or needs review. */
export function ClosureStatusBadge({ status, bound, className }: ClosureStatusBadgeProps) {
  const { t } = useI18n();
  const spec = closureBadgeSpec(status, bound);
  const label = spec.bound !== undefined ? t("Open · false-novelty risk ≤ {{bound}}%", { bound: spec.bound }) : t(spec.labelKey);
  const title = {
    NOT_CHECKED: t("No closure check has been decided for this gap yet."),
    CLOSED: t("A paper already answers this question. The witness quote is in the closure check."),
    OPEN_CERTIFIED: t("No paper answers this question and the false-novelty bound is within the allowed maximum."),
    ABSTAIN: t("The closure check could not certify this gap as open or closed. Open the check to see why."),
  }[status ?? "NOT_CHECKED"];
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", TONE_CLASS[spec.tone], className)}
    >
      {label}
    </Badge>
  );
}
