import { useEffect, useId, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";

export interface AsyncPickerProps<T> {
  /** Accessible name of the combobox input. */
  label: string;
  placeholder?: string;
  /** Namespace for the react-query cache of this picker's searches. */
  cacheKey: string;
  fetcher: (query: string) => Promise<T[]>;
  getKey: (item: T) => string;
  renderOption: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  isDisabled?: (item: T) => boolean;
  isSelected?: (item: T) => boolean;
  /** Section heading shown above the first option of each group (options must arrive grouped). */
  getGroup?: (item: T) => string;
  /** Keep the query and the list open after a pick (multi-select). Default: clear and close. */
  keepOpen?: boolean;
}

/** Debounced async combobox following the ARIA 1.2 combobox/listbox pattern. */
export function AsyncPicker<T>({
  label,
  placeholder,
  cacheKey,
  fetcher,
  getKey,
  renderOption,
  onSelect,
  isDisabled,
  isSelected,
  getGroup,
  keepOpen = false,
}: AsyncPickerProps<T>) {
  const { t } = useI18n();
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebouncedValue(query.trim(), 250);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["admin", "catalog-picker", cacheKey, debounced],
    queryFn: () => fetcher(debounced),
    enabled: open,
    staleTime: 30_000,
  });
  const items = data ?? [];
  const index = Math.min(active, Math.max(items.length - 1, 0));

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${index}`)?.scrollIntoView?.({ block: "nearest" });
  }, [id, index, open]);

  function pick(item: T) {
    if (isDisabled?.(item)) return;
    onSelect(item);
    if (!keepOpen) {
      setQuery("");
      setOpen(false);
    }
    setActive(0);
  }

  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    >
      <Input
        role="combobox"
        autoComplete="off"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={open && items.length ? `${id}-option-${index}` : undefined}
        value={query}
        maxLength={120}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive(open ? (index + step + items.length) % Math.max(items.length, 1) : 0);
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (open && items[index]) pick(items[index]!);
          }
        }}
      />
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
          <div id={`${id}-options`} role="listbox" aria-label={label}>
            {items.map((item, i) => {
              const group = getGroup?.(item);
              const showGroup = group !== undefined && (i === 0 || getGroup!(items[i - 1]!) !== group);
              const disabled = isDisabled?.(item) ?? false;
              return (
                <div key={getKey(item)} role="presentation">
                  {showGroup ? (
                    <div role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</div>
                  ) : null}
                  <button
                    id={`${id}-option-${i}`}
                    role="option"
                    aria-selected={isSelected ? isSelected(item) : i === index}
                    aria-disabled={disabled || undefined}
                    type="button"
                    tabIndex={-1}
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setActive(i)}
                    onClick={() => pick(item)}
                    className={`block w-full whitespace-normal break-words rounded px-3 py-2 text-left disabled:opacity-50 ${i === index ? "bg-accent" : "hover:bg-accent"}`}
                  >
                    {renderOption(item)}
                  </button>
                </div>
              );
            })}
          </div>
          {isError ? <p role="status" className="px-3 py-2 text-destructive">{t("Search failed. Try again.")}</p> : null}
          {!isError && isFetching && !items.length ? <p role="status" className="px-3 py-2 text-muted-foreground">{t("Searching…")}</p> : null}
          {!isError && !isFetching && !items.length ? <p role="status" className="px-3 py-2 text-muted-foreground">{t("No results")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
