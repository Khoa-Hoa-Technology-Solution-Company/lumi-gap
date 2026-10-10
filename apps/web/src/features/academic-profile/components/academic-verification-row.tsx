import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

export function AcademicVerificationRow({ icon: Icon, title, status, statusLabel, statusDescription, description, meta, feedback, action }: {
  icon: LucideIcon;
  title: string;
  status: string;
  statusLabel: string;
  statusDescription?: string;
  description: ReactNode;
  meta?: ReactNode;
  feedback?: ReactNode;
  action?: ReactNode;
}) {
  const headingId = useId();
  const tone = status === "VERIFIED"
    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
    : ["PENDING", "NEEDS_MORE_INFORMATION"].includes(status)
      ? "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
      : status === "REJECTED"
        ? "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
        : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300";

  return <section aria-labelledby={headingId} className="flex min-w-0 gap-3 border-t border-slate-200/80 py-4 dark:border-white/10 sm:gap-4 sm:py-5">
    <div aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"><Icon className="h-[18px] w-[18px]" /></div>
    <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 id={headingId} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <span role="status" aria-label={statusDescription} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none", tone)}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{statusLabel}</span>
        </div>
        <div className="mt-2 break-words text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</div>
        {meta && <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{meta}</p>}
        {feedback && <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-amber-300 pl-3 text-sm leading-6 text-slate-700 dark:border-amber-700 dark:text-slate-300">{feedback}</p>}
      </div>
      {action && <div className="mt-3 flex min-w-0 shrink-0 flex-wrap gap-2 [&>*]:h-auto [&>*]:min-h-9 [&>*]:max-w-full [&>*]:whitespace-normal [&>*]:py-2 sm:mt-0 sm:max-w-[15rem] sm:justify-end">{action}</div>}
    </div>
  </section>;
}
