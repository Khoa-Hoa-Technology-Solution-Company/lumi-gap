import { Link } from "react-router-dom";
import type { ResearchStage } from "@trend/shared-types";
import { ArrowUpRight, Info, Layers } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n";
import { projectSectionHref, stageLabels } from "./workspace-common";

const orderedStages = Object.keys(stageLabels) as ResearchStage[];

/**
 * Interactive stage selector strip showing the team's current research focus.
 * Does NOT infer completion of earlier stages from array order.
 */
export function ResearchStagePipeline({
  stage,
  canManage,
  pending,
  onSelect,
  hideCurrentBadge = false,
}: {
  stage: ResearchStage | null;
  canManage: boolean;
  pending: boolean;
  onSelect: (next: ResearchStage | null) => void;
  hideCurrentBadge?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="mt-5 pt-4 border-t border-border/60" data-no-i18n>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="inline-flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {t("Research stage")}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("About research stage")}
                className="h-5 w-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs leading-relaxed">
              {t("Research stage reflects the team's current focus, not overall completion of the research.")}
            </TooltipContent>
          </Tooltip>
        </div>

        {!hideCurrentBadge ? (
          stage ? (
            <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
              {t("Current stage: {{stage}}", { stage: t(stageLabels[stage]) })}
            </span>
          ) : (
            <span className="text-xs font-medium text-muted-foreground bg-muted/60 px-2.5 py-0.5 rounded-full">
              {t("Not set")}
            </span>
          )
        ) : null}
      </div>

      <ol
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2"
        aria-label={t("Research stage")}
      >
        {orderedStages.map((key, index) => {
          const isActive = key === stage;
          const label = t(stageLabels[key]);
          const baseClass = `group flex h-full items-start gap-2 rounded-xl border px-2.5 py-2.5 text-left text-xs transition-colors min-h-[46px] ${
            isActive
              ? "border-primary/60 bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/20"
              : "border-border/70 bg-muted/20 text-muted-foreground font-medium"
          }`;
          const indicator = (
            <span
              className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 tabular-nums ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              aria-hidden="true"
            >
              {index + 1}
            </span>
          );

          return (
            <li key={key} className="min-w-0">
              {canManage ? (
                <button
                  type="button"
                  disabled={pending}
                  title={label}
                  aria-label={label}
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => onSelect(isActive ? null : key)}
                  className={`${baseClass} w-full hover:border-primary/40 hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60 cursor-pointer`}
                >
                  {indicator}
                  <span className="leading-snug line-clamp-2 break-words">{label}</span>
                </button>
              ) : (
                <div
                  title={label}
                  aria-label={label}
                  aria-current={isActive ? "step" : undefined}
                  className={baseClass}
                >
                  {indicator}
                  <span className="leading-snug line-clamp-2 break-words">{label}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Stacked Recharts visualization summarizing literature screening progress across library items. */
export function LiteratureScreeningFunnel({
  projectId,
  papers,
  pendingScreening,
  included,
}: {
  projectId: string;
  papers: number;
  pendingScreening: number;
  included: number;
}) {
  const { t } = useI18n();
  if (papers <= 0) return null;

  const processed = Math.max(0, papers - pendingScreening);
  const resolvedOther = Math.max(0, papers - included - pendingScreening);
  const pct = Math.min(100, Math.round((processed / papers) * 100));

  const includedLabel = t("Included papers");
  const pendingLabel = t("Awaiting screening");
  const otherLabel = t("Other / Excluded");

  const chartData = [
    {
      name: t("Literature screening funnel"),
      [includedLabel]: included,
      [pendingLabel]: pendingScreening,
      [otherLabel]: resolvedOther,
    },
  ];

  return (
    <div className="mb-5 rounded-xl border border-border/70 bg-muted/20 p-4" data-no-i18n>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-sm font-bold text-foreground">{t("Literature screening funnel")}</span>
          <span className="text-xs font-semibold text-muted-foreground bg-background border border-border/70 rounded-full px-2.5 py-0.5 tabular-nums">
            {t("Processed {{count}} of {{total}}", { count: processed, total: papers })} ({pct}%)
          </span>
        </div>
        {pendingScreening > 0 ? (
          <Link
            to={projectSectionHref(projectId, "papers", { view: "screening" })}
            className="text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline inline-flex items-center gap-1"
          >
            {t("Screen now")}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <div className="h-9 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 0, bottom: 4, left: 0 }} barSize={16}>
            <XAxis type="number" domain={[0, papers]} hide />
            <YAxis type="category" dataKey="name" hide />
            <RechartsTooltip
              cursor={{ fill: "transparent" }}
              contentStyle={{
                borderRadius: "0.75rem",
                border: "1px solid hsl(var(--border))",
                backgroundColor: "hsl(var(--popover))",
                color: "hsl(var(--popover-foreground))",
                fontSize: "12px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
              }}
            />
            <Bar
              dataKey={includedLabel}
              stackId="funnel"
              fill="#10b981"
              radius={pendingScreening === 0 && resolvedOther === 0 ? [8, 8, 8, 8] : [8, 0, 0, 8]}
            />
            <Bar
              dataKey={pendingLabel}
              stackId="funnel"
              fill="#f59e0b"
              radius={
                included === 0 && resolvedOther === 0
                  ? [8, 8, 8, 8]
                  : included === 0
                    ? [8, 0, 0, 8]
                    : resolvedOther === 0
                      ? [0, 8, 8, 0]
                      : [0, 0, 0, 0]
              }
            />
            <Bar
              dataKey={otherLabel}
              stackId="funnel"
              fill="#94a3b8"
              radius={included === 0 && pendingScreening === 0 ? [8, 8, 8, 8] : [0, 8, 8, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
          <strong className="text-foreground tabular-nums">{included}</strong>
          <span>{includedLabel}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
          <strong className="text-foreground tabular-nums">{pendingScreening}</strong>
          <span>{pendingLabel}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" aria-hidden="true" />
          <strong className="text-foreground tabular-nums">{resolvedOther}</strong>
          <span>{otherLabel}</span>
        </span>
      </div>
    </div>
  );
}

/** Extract two-character uppercase initials for contributor avatar badges. */
export function getContributorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
