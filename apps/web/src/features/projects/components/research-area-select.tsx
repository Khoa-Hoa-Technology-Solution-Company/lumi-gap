import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";

/** Uses onboarding taxonomy values verbatim; custom labels remain project metadata. */
export function ResearchAreaSelect({ values, onChange, options = [], max = 3, label = "Research areas" }: {
  values: string[]; onChange: (values: string[]) => void; options?: string[]; max?: number; label?: string;
}) {
  const { t } = useI18n(), id = useId();
  const [query, setQuery] = useState(""), [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const normalized = query.trim().toLocaleLowerCase();
  const selected = (value: string) => values.some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase());
  const matches = options.filter(value => !selected(value) && `${value} ${t(value)}`.toLocaleLowerCase().includes(normalized)).slice(0, 20);
  const canonical = options.find(value => value.toLocaleLowerCase() === normalized || t(value).toLocaleLowerCase() === normalized);
  const custom = query.trim() && !canonical && !selected(query.trim());
  const choices = [...matches, ...(custom ? [query.trim()] : [])];
  const full = values.length >= max;
  const index = Math.min(active, Math.max(0, choices.length - 1));
  useEffect(() => { if (open && !full) document.getElementById(`${id}-option-${index}`)?.scrollIntoView?.({ block: "nearest" }); }, [id, index, open, full]);
  function add(value: string) {
    if (full || selected(value) || !value.trim() || value.length > 120) return;
    onChange([...values, value]); setQuery(""); setActive(0);
  }
  return <div className="min-w-0 space-y-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <div className="flex items-center justify-between gap-2"><label htmlFor={id} className="text-sm font-medium">{t(label)}</label><span id={`${id}-count`} className="text-xs text-muted-foreground" aria-live="polite">{values.length}/{max}</span></div>
    {values.length > 0 && <div className="flex min-w-0 flex-wrap gap-2">{values.map(value => <button key={value} type="button" aria-label={`${t("Remove")} ${t(value)}`} onClick={() => onChange(values.filter(item => item !== value))} className="inline-flex max-w-full items-center gap-2 rounded-md bg-muted px-2.5 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 break-words text-left [overflow-wrap:anywhere]">{t(value)}</span><X size={14} className="shrink-0" aria-hidden="true" /></button>)}</div>}
    <div className="relative">
      <Input id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-describedby={`${id}-count`} aria-activedescendant={open && !full && choices.length ? `${id}-option-${index}` : undefined}
        value={query} maxLength={120} placeholder={t("Search research areas…")} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(open ? (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % Math.max(choices.length, 1) : 0); }
          if (event.key === "Enter") { event.preventDefault(); if (open && choices[index]) add(choices[index]!); else setOpen(true); }
        }} />
      {open && <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
        <div id={`${id}-options`} role="listbox" aria-label={t(label)}>{choices.map((value, i) => <button id={`${id}-option-${i}`} role="option" aria-selected={i === index} type="button" tabIndex={-1} disabled={full} key={value} onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(i)} onClick={() => add(value)} className={`block w-full whitespace-normal break-words rounded px-3 py-2 text-left disabled:opacity-50 ${i === index ? "bg-accent" : "hover:bg-accent"}`}>
          {custom && i === choices.length - 1 ? t("Add custom area: {{area}}", { area: value }) : t(value)}
        </button>)}</div>
        {!choices.length && <p role="status" className="px-3 py-2 text-muted-foreground">{t("No matching areas. Type a custom area to add it.")}</p>}
        {full && <p role="status" className="px-3 py-2 text-xs text-muted-foreground">{t("Remove an area before adding another.")}</p>}
      </div>}
    </div>
  </div>;
}
