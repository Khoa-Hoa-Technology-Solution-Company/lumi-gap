import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";

export function OnboardingAreaPicker({ options, values, onChange, max, loading, failed, onRetry }: {
  options: string[]; values: string[]; onChange: (values: string[]) => void; max: number;
  loading: boolean; failed: boolean; onRetry: () => void;
}) {
  const { t } = useI18n();
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(-1);
  const display = (value: string) => { const translated = t(value); return typeof translated === "string" ? translated : value; };
  const query = search.trim().toLocaleLowerCase();
  const matches = options.filter(option => display(option).toLocaleLowerCase().includes(query) || option.toLocaleLowerCase().includes(query));
  const disabled = (option: string) => !values.includes(option) && values.length >= max;
  function close() { setOpen(false); setActive(-1); setSearch(""); }
  function choose(option: string) {
    if (disabled(option)) return;
    onChange(values.includes(option) ? values.filter(value => value !== option) : [...values, option]);
    close();
    input.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open, listId]);
  return <div ref={container} className="onboarding-area-picker">
    <div className="onboarding-area-search">
      <Input ref={input} id="area-search" role="combobox" aria-labelledby="onboarding-fields-label" aria-describedby="area-limit"
        aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-haspopup="listbox"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off" value={search} placeholder={t("Search research areas")}
        onClick={() => setOpen(true)}
        onChange={event => { setSearch(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); close(); }
          else if (event.key === "Tab") close();
          else if (event.key === "Enter") { event.preventDefault(); if (open && active >= 0 && matches[active]) choose(matches[active]!); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            let next = active < 0 ? (direction === 1 ? -1 : 0) : active;
            for (let attempt = 0; attempt < matches.length; attempt++) {
              next = (next + direction + matches.length) % matches.length;
              if (!disabled(matches[next]!)) { setActive(next); break; }
            }
          }
        }} />
      <button type="button" aria-label={t(open ? "Close research fields" : "Show research fields")} aria-expanded={open} aria-controls={listId}
        onClick={() => { if (open) close(); else { input.current?.focus(); setOpen(true); } }}><ChevronDown aria-hidden="true" /></button>
    </div>
    <div id={listId} role="listbox" aria-label={t("Research fields")} aria-multiselectable="true" hidden={!open} className="onboarding-area-dropdown">
      {loading && <p role="status">{t("Loading research fields…")}</p>}
      {matches.map((option, index) => <button key={option} type="button" role="option" id={`${listId}-${index}`}
        aria-selected={values.includes(option)} disabled={disabled(option)} data-active={active === index}
        tabIndex={-1} onClick={() => choose(option)}>
        <span>{display(option)}</span><span className="onboarding-area-check" aria-hidden="true">{values.includes(option) && <Check />}</span>
      </button>)}
      {!loading && !failed && !matches.length && <p>{t("No more matching fields. Try another search.")}</p>}
      {failed && <button type="button" onClick={onRetry}>{t("Retry")}</button>}
    </div>
  </div>;
}
