import { useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { docsPath, type DocsSectionId } from "../docs-section-ids";
import type { DocsGlossaryEntry } from "../docs.types";
import { richTextToPlain } from "../utils/docs-rich-text";
import { fillTemplate, useDocsContext } from "./docs-context";
import { CopyLinkButton } from "./docs-heading";
import { DocsRichText } from "./docs-rich-text";

/** Lower case without diacritics, so "thi phan" finds "Thị phần". */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export function filterGlossaryEntries(entries: DocsGlossaryEntry[], query: string): DocsGlossaryEntry[] {
  const needle = normalizeSearchText(query);
  if (!needle) return entries;
  return entries.filter((entry) => {
    const haystack = normalizeSearchText([entry.term, entry.aka ?? "", richTextToPlain(entry.definition), entry.example ? richTextToPlain(entry.example) : ""].join(" "));
    return needle.split(/\s+/).every((word) => haystack.includes(word));
  });
}

export function glossaryAnchor(entryId: string): string {
  return `term-${entryId}`;
}

export function DocsGlossary({ entries, sectionId }: { entries: DocsGlossaryEntry[]; sectionId: DocsSectionId }) {
  const { ui, sectionHeadings, language } = useDocsContext();
  const [query, setQuery] = useState("");
  const inputId = useId();
  const sorted = useMemo(() => [...entries].sort((a, b) => a.term.localeCompare(b.term, language)), [entries, language]);
  const shown = useMemo(() => filterGlossaryEntries(sorted, query), [sorted, query]);

  return (
    <div className="space-y-4">
      <div className="sticky top-[calc(var(--app-header-height)+0.5rem)] z-10 -mx-1 rounded-lg bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <label htmlFor={inputId} className="sr-only">{ui.glossarySearch}</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={inputId}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ui.glossarySearch}
            className="pl-9 pr-9"
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={ui.glossarySearch}
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {fillTemplate(ui.glossaryCount, { shown: shown.length, total: entries.length })}
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{ui.glossaryEmpty}</p>
      ) : (
        <dl className="space-y-3">
          {shown.map((entry) => {
            const anchor = glossaryAnchor(entry.id);
            return (
              <div
                key={entry.id}
                id={anchor}
                tabIndex={-1}
                className="group scroll-mt-[calc(var(--app-header-height)+7rem)] rounded-lg border bg-card p-4 focus:outline-none target:ring-2 target:ring-blue-400"
              >
                <dt className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="text-base font-semibold text-foreground">{entry.term}</span>
                    {entry.aka ? <span className="ml-2 text-sm text-muted-foreground">({entry.aka})</span> : null}
                  </span>
                  <CopyLinkButton path={docsPath(sectionId, anchor)} className="-mr-1 -mt-1 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" />
                </dt>
                <dd className="mt-1 leading-7 text-foreground/90"><DocsRichText text={entry.definition} /></dd>
                {entry.example ? (
                  <dd className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-sm leading-6 text-foreground/90">
                    <span className="font-semibold">{ui.glossaryExample}</span> <DocsRichText text={entry.example} />
                  </dd>
                ) : null}
                {entry.see && entry.see.length > 0 ? (
                  <dd className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="text-muted-foreground">{ui.glossarySee}</span>
                    {entry.see.map((target) => (
                      <Link
                        key={target}
                        to={docsPath(target)}
                        className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700 dark:text-blue-300 dark:decoration-blue-700"
                      >
                        {sectionHeadings[target] ?? target}
                      </Link>
                    ))}
                  </dd>
                ) : null}
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
