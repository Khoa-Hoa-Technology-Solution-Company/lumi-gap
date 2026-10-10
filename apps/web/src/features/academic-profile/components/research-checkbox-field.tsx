import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";

export function ResearchCheckboxField({ id, label, description, options, allOptions, groups, values, onChange, max, placeholder, searchLabel }: {
  id: string; label: string; description: string; options: string[]; values: string[];
  onChange: (values: string[]) => void; max: number; placeholder: string;
  allOptions: string[]; groups?: { label: string; options: string[] }[]; searchLabel: string;
}) {
  const { t } = useI18n();
  const searchInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const matches = (selected: string, option: string) => normalize(selected) === normalize(option) || (allOptions.includes(option) && normalize(selected) === normalize(t(option)));
  const displayValue = (value: string) => {
    const option = allOptions.find(item => matches(value, item));
    const translated = option ? t(option) : value;
    return typeof translated === "string" ? translated : value;
  };
  const selected = (option: string) => values.some(value => matches(value, option));
  const searching = Boolean(search.trim());
  const matchingOptions = (searching ? allOptions.filter(option => normalize(displayValue(option)).includes(normalize(search)) || normalize(option).includes(normalize(search))) : options).filter(option => !selected(option));
  const visibleOptions = searching || showAll ? matchingOptions : matchingOptions.slice(0, 6);
  const clean = search.trim();
  const canonical = allOptions.find(option => matches(clean, option)) ?? clean;
  const canAdd = Boolean(clean && clean.length <= 80 && values.length < max && !values.some(value => matches(value, canonical)));
  function addCustom() {
    if (!canAdd) return;
    onChange([...values, canonical]);
    setSearch("");
  }
  function choices(items: string[]) {
    return <div className="onboarding-research-choices">{items.map(option => {
      const checked = selected(option);
      return <label key={option} className="onboarding-research-choice" data-selected={checked}>
        <input type="checkbox" name={id} value={option} checked={checked} disabled={!checked && values.length >= max}
          onChange={() => { if (checked) onChange(values.filter(value => !matches(value, option))); else if (values.length < max) onChange([...values, option]); searchInput.current?.focus(); }} />
        {!checked && <Plus aria-hidden="true" />}<span>{displayValue(option)}</span>{checked && <X aria-hidden="true" />}
      </label>;
    })}</div>;
  }
  return <fieldset className="onboarding-research-field" aria-label={t(label)} aria-describedby={`${id}-help`}>
    <p id={`${id}-help`} className="text-muted-foreground">{t(description)}</p>
    {values.length > 0 && <div className="onboarding-selected-options" aria-label={t("Your selections")}>{choices(values)}</div>}
    <div className="onboarding-research-search"><Input ref={searchInput} id={`${id}-search`} aria-label={t(searchLabel)} value={search} maxLength={80} placeholder={t(placeholder)} onChange={event => setSearch(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} />
      <Button type="button" variant="outline" disabled={!canAdd} onClick={addCustom}>{t("Add")}</Button>
    </div>
    <div className="onboarding-suggestions" aria-label={t(searching ? "Search results" : "Suggested for your fields")}>
      {!searching && <p className="text-xs font-medium text-muted-foreground">{t("Suggested for your fields")}</p>}
      {!visibleOptions.length ? <p className="text-sm text-muted-foreground">{t(values.some(value => matches(value, canonical)) ? "This item is already selected." : "No matching suggestions. Use Add to include your own.")}</p> : groups && showAll && !searching ? groups.map(group => {
        const items = group.options.filter(option => visibleOptions.includes(option));
        return items.length > 0 && <div key={group.label} className="onboarding-suggestion-group"><h4>{t(group.label)}</h4>{choices(items)}</div>;
      }) : choices(visibleOptions)}
    </div>
    {!searching && (showAll || matchingOptions.length > 6) && <button type="button" className="onboarding-text-action" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{t(showAll ? "Show fewer suggestions" : "Show more suggestions")}</button>}
    {values.length >= max && <p className="onboarding-research-limit text-muted-foreground" aria-live="polite">{t("Selection limit reached. Remove an item to choose another.")}</p>}
  </fieldset>;
}
