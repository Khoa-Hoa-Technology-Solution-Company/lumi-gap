import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { useForumPaperSearch } from "../hooks/use-forum";
import { forumPaperApi, type ForumPaperSearchResult } from "../api/forum-paper.api";
import type { ForumReferenceView } from "../api/forum.api";
import { ForumDoiLookup } from "./forum-doi-lookup";
import { isValidDoi, normalizeDoi } from "@/features/projects/utils/doi";

export function ForumCitationPicker({ onInsert, onClose }: { onInsert: (paper: ForumReferenceView & { paperId: string }) => boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"search" | "doi">("search");
  const [searchText, setSearchText] = useState("");
  const [doiText, setDoiText] = useState("");
  const [query, setQuery] = useState("");
  const [selectedSearch, setSelectedSearch] = useState<ForumPaperSearchResult>();
  const [selectedDoi, setSelectedDoi] = useState<ForumReferenceView & { paperId: string }>();
  const selected = mode === "search" ? selectedSearch : selectedDoi;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const insert = useMutation({ mutationFn: async (paper: ForumPaperSearchResult) => paper.paperId ? paper : forumPaperApi.attachOpenAlex(paper.openalexId), onSuccess: (paper) => {
    if (mounted.current && paper.paperId && onInsert({ paperId: paper.paperId, title: paper.title, doi: paper.doi, year: paper.publicationYear, authors: paper.authors, venue: paper.venue })) onClose();
  } });
  useEffect(() => { const timer = window.setTimeout(() => setQuery(searchText.trim()), 250); return () => window.clearTimeout(timer); }, [searchText]);
  const lookup = useForumPaperSearch(query, mode === "search");
  const results = lookup.data ?? [];
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-w-xl" onCloseAutoFocus={(event) => event.preventDefault()}>
      <DialogHeader><DialogTitle>{t("Add citation")}</DialogTitle><DialogDescription>{t("Choose a paper to cite at the cursor. Citation numbers update automatically.")}</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2">{(["search", "doi"] as const).map((item) => <Button type="button" key={item} disabled={insert.isPending} aria-pressed={mode === item} variant={mode === item ? "secondary" : "ghost"} onClick={() => { setMode(item); insert.reset(); }}>{t(item === "search" ? "Search OpenAlex papers" : "Enter DOI")}</Button>)}</div>
      <Input autoFocus disabled={insert.isPending} maxLength={mode === "doi" ? 300 : 160} aria-label={t(mode === "doi" ? "DOI" : "Search OpenAlex papers")} value={mode === "search" ? searchText : doiText} onChange={(event) => { insert.reset(); if (mode === "search") { setSearchText(event.target.value); setSelectedSearch(undefined); } else { setDoiText(event.target.value); setSelectedDoi(undefined); } }} placeholder={t(mode === "doi" ? "Paste a DOI or doi.org link" : "Search papers by title or keyword")} />
      <div hidden={mode !== "search"}>
        {query.length < 3 ? <p className="text-sm text-muted-foreground">{t("Type at least 3 characters to search.")}</p> : lookup.isError ? <div role="alert"><p>{t("Could not load papers.")}</p><Button type="button" variant="ghost" onClick={() => void lookup.refetch()}>{t("Try again")}</Button></div> : lookup.isLoading || searchText.trim() !== query ? <p role="status">{t("Searching papers…")}</p> : <div className="max-h-64 overflow-y-auto rounded-md border border-border" role="listbox" aria-label={t("Citation results")}>
          {results.length ? results.map((paper) => <button type="button" key={paper.openalexId} disabled={!paper.canAttach || insert.isPending} role="option" aria-selected={selectedSearch?.openalexId === paper.openalexId} className="block w-full border-b border-border p-3 text-left last:border-0 hover:bg-muted aria-selected:bg-accent disabled:opacity-50" onClick={() => setSelectedSearch(paper)}><span className="block text-sm font-medium">{paper.title}</span><span className="text-xs text-muted-foreground">{[paper.authors?.join(", "), paper.publicationYear, paper.venue, paper.doi].filter(Boolean).join(" · ")}</span>{!paper.canAttach ? <span className="block text-xs text-muted-foreground">{t("This paper is missing citation metadata (title, authors, or year).")}</span> : null}</button>) : <p className="p-3 text-sm text-muted-foreground">{t("No papers found")}</p>}
        </div>}
      </div>
      {/* Keep the resolver mounted so switching tabs retains its result and pending request. */}
      <div hidden={mode !== "doi"}>{isValidDoi(doiText) ? <ForumDoiLookup key={normalizeDoi(doiText)} doi={normalizeDoi(doiText)} onAttach={(paper) => setSelectedDoi({ paperId: paper.paperId, title: paper.title, authors: paper.authors, year: paper.publicationYear, doi: paper.doi, venue: paper.venue })} /> : doiText ? <p role="alert" className="text-sm text-destructive">{t("Enter a valid DOI, such as 10.1234/example.")}</p> : null}</div>
      {selected ? <p className="text-sm" role="status">{t("Selected paper")}: {selected.title}</p> : null}
      {insert.isError ? <p role="alert" className="text-sm text-destructive">{t("Could not attach this paper. Please try again.")}</p> : null}
      <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button><Button type="button" disabled={!selected || insert.isPending || (mode === "search" && searchText.trim() !== query)} onClick={() => { if (mode === "search" && selectedSearch) insert.mutate(selectedSearch); else if (selectedDoi && onInsert(selectedDoi)) onClose(); }}>{t(insert.isPending ? "Attaching paper…" : "Insert citation")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
