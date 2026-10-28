import { cn } from "@/utils/cn";

export type AdminTab<T extends string> = { value: T; label: string; badge?: number };

/** Underline tabs shared by the admin pages; the active tab is announced with aria-selected. */
export function AdminTabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: Array<AdminTab<T>>; value: T; onChange: (value: T) => void }) {
  return <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b">
    {tabs.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={value === tab.value} onClick={() => onChange(tab.value)}
      className={cn("inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value === tab.value ? "border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground")}>
      {tab.label}
      {tab.badge ? <span className="ml-2 rounded-full bg-blue-700 px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums">{tab.badge}</span> : null}
    </button>)}
  </div>;
}
