import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BookMarked, Check, FileSearch, Loader2, Search } from "lucide-react";
import type { IProject, Paper } from "@trend/shared-types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBookmarks } from "@/features/bookmarks/hooks/use-bookmarks";
import { useAddPaperToProject } from "@/features/projects/hooks/use-projects";
import { isValidDoi, matchesExactDoi, normalizeDoi } from "@/features/projects/utils/doi";
import { papersApi } from "@/features/papers/api/papers.api";
import { useI18n } from "@/i18n";

type PaperSearchHit = Paper & { score?: number; aiScore?: { finalScore?: number } };

function paperAuthorLine(paper: Paper) {
  const names = paper.authors?.map((author) => author.displayName).filter(Boolean) ?? [];
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} et al.` : names.join(", ");
}

export function ProjectPaperPickerDialog({
  projectId,
  papers,
  open,
  onOpenChange,
}: {
  projectId: string;
  papers: IProject["papers"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [source, setSource] = useState<"search" | "library" | "doi">("search");
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const addPaper = useAddPaperToProject(projectId);
  const [isAdding, setIsAdding] = useState(false);
  const queryText = searchText.trim();
  const normalizedDoi = source === "doi" ? normalizeDoi(queryText) : "";
  const validDoi = source === "doi" && isValidDoi(queryText);
  const effectiveSearchQuery = source === "doi" ? normalizedDoi : queryText;
  useEffect(() => {
    if (source === "library" || queryText.length < 3 || (source === "doi" && !validDoi)) {
      setSearchQuery("");
      return;
    }
    const timer = window.setTimeout(() => setSearchQuery(effectiveSearchQuery), 250);
    return () => window.clearTimeout(timer);
  }, [effectiveSearchQuery, queryText.length, source, validDoi]);
  const search = useQuery({
    queryKey: ["projectPaperPickerSearch", searchQuery],
    queryFn: async () => (await papersApi.list({ q: searchQuery, page: 1, pageSize: 12 })).papers as PaperSearchHit[],
    enabled: open && source !== "library" && searchQuery.length >= 3 && (source !== "doi" || validDoi),
    staleTime: 30_000,
  });
  const bookmarks = useBookmarks({ enabled: open && source === "library" });
  const existingIds = useMemo(() => new Set(papers.map((link) => {
    const target = link.targetId;
    return typeof target === "string" ? target : target?._id;
  }).filter((id): id is string => Boolean(id))), [papers]);
  const libraryIds = useMemo(() => [...new Set((bookmarks.data ?? [])
    .filter((bookmark) => bookmark.targetKind === "paper" && !existingIds.has(bookmark.targetId))
    .map((bookmark) => bookmark.targetId))], [bookmarks.data, existingIds]);
  const library = useQuery({
    queryKey: ["projectPaperPickerLibrary", libraryIds],
    queryFn: async () => {
      const loaded: Paper[] = [];
      for (let index = 0; index < libraryIds.length; index += 8) {
        const batch = await Promise.all(libraryIds.slice(index, index + 8).map(async (paperId) => {
          try { return await papersApi.detail(paperId); } catch { return null; }
        }));
        loaded.push(...batch.filter((paper): paper is Paper => paper !== null));
      }
      return loaded;
    },
    enabled: open && source === "library" && !bookmarks.isLoading && !bookmarks.isError,
    staleTime: 60_000,
  });

  useEffect(() => {
    setSelectedIds([]);
  }, [source, queryText]);

  const closePicker = (nextOpen: boolean) => {
    if (!nextOpen && isAdding) return;
    if (!nextOpen) {
      setSearchText("");
      setSelectedIds([]);
      setSource("search");
    }
    onOpenChange(nextOpen);
  };

  const results = source === "library"
    ? library.data ?? []
    : source === "doi"
      ? (search.data ?? []).filter((paper) => matchesExactDoi(paper.externalIds?.doi, normalizedDoi))
      : search.data ?? [];
  const sortedResults = [...results].sort((left, right) => {
    const leftScore = (left as PaperSearchHit).score ?? (left as PaperSearchHit).aiScore?.finalScore ?? left.dataQualityScore ?? 0;
    const rightScore = (right as PaperSearchHit).score ?? (right as PaperSearchHit).aiScore?.finalScore ?? right.dataQualityScore ?? 0;
    return rightScore - leftScore;
  });
  const isLoading = source === "library" ? bookmarks.isLoading || library.isLoading : search.isLoading;
  const isError = source === "library" ? bookmarks.isError || library.isError : search.isError;
  const waitingForDebounce = source !== "library" && queryText.length >= 3 && (source !== "doi" || validDoi) && searchQuery !== effectiveSearchQuery;

  const togglePaper = (paperId: string) => {
    setSelectedIds((current) => current.includes(paperId) ? current.filter((id) => id !== paperId) : [...current, paperId]);
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedIds.length || isAdding) return;
    setIsAdding(true);
    let added = 0;
    const failed: string[] = [];
    for (const paperId of selectedIds) {
      try {
        await addPaper.mutateAsync({ paperId });
        added += 1;
        setSelectedIds((current) => current.filter((id) => id !== paperId));
      } catch {
        failed.push(paperId);
      }
    }
    setIsAdding(false);
    if (added > 0) toast.success(t("{{count}} papers added to the project.", { count: added }));
    if (failed.length) {
      toast.error(t("Some papers could not be added. Check that they are not already in this project."));
      return;
    }
    closePicker(false);
  };

  const retry = () => {
    if (source === "library") {
      void bookmarks.refetch();
      void library.refetch();
    } else {
      void search.refetch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={closePicker}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <DialogTitle>{t("Add papers to this project")}</DialogTitle>
          <DialogDescription>{t("Find literature in LumiGap or choose papers saved to your library.")}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b px-4 pt-2" role="tablist" aria-label={t("Paper source")}>
          {([
            ["search", "Search LumiGap", Search],
            ["library", "My Library", BookMarked],
            ["doi", "Add by DOI", FileSearch],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={source === value}
              onClick={() => { setSource(value); setSearchText(""); }}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${source === value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" />{t(label)}
            </button>
          ))}
        </div>

        <form onSubmit={handleAdd} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 px-5 py-4 sm:px-6">
            <Label htmlFor="project-paper-search">{t(source === "doi" ? "DOI" : "Search papers")}</Label>
            <div className="relative">
              {source === "doi" ? <FileSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /> : <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
              <Input
                id="project-paper-search"
                className="pl-9"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t(source === "doi" ? "Paste a DOI or doi.org link" : "Search by title, author, or keyword")}
                autoComplete="off"
                autoFocus
                disabled={isAdding || source === "library"}
              />
            </div>
            {source === "doi" ? <p className="text-xs text-muted-foreground">{t("Looks for an exact DOI already indexed in LumiGap. This will not create a paid paper request.")}</p> : null}
            {source === "doi" && queryText.length > 0 && !validDoi ? <p className="text-xs text-destructive">{t("Enter a valid DOI, such as 10.1234/example.")}</p> : null}
            {source !== "library" && source !== "doi" && queryText.length < 3 ? <p className="text-xs text-muted-foreground">{t("Type at least 3 characters to search.")}</p> : null}
            {source === "library" ? <p className="text-xs text-muted-foreground">{t("Saved papers that are not already in this project.")}</p> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-y px-5 py-3 sm:px-6">
            {source !== "library" && queryText.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("Your results will appear here.")}</div>
            ) : source === "doi" && !validDoi ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("Enter a valid DOI, such as 10.1234/example.")}</div>
            ) : source !== "library" && source !== "doi" && queryText.length < 3 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("Type at least 3 characters to search.")}</div>
            ) : waitingForDebounce || isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("Searching papers…")}</div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="text-sm text-muted-foreground">{t("Search could not load results.")}</p>
                <Button type="button" variant="outline" size="sm" onClick={retry}>{t("Try again")}</Button>
              </div>
            ) : sortedResults.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {source === "library" ? t("No saved papers are available to add.") : source === "doi" ? t("No paper with this DOI is indexed in LumiGap yet.") : t("No papers found. Try a broader search.")}
              </div>
            ) : (
              <div className="divide-y">
                {sortedResults.map((paper) => {
                  const alreadyAdded = existingIds.has(paper.id);
                  const checked = selectedIds.includes(paper.id);
                  return (
                    <label key={paper.id} className={`flex cursor-pointer items-start gap-3 py-3 ${alreadyAdded ? "cursor-not-allowed opacity-60" : "hover:bg-muted/40"}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={alreadyAdded || isAdding}
                        onChange={() => togglePaper(paper.id)}
                        className="mt-1 h-4 w-4 rounded border-input accent-primary focus-visible:ring-ring"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-5 text-foreground">{paper.title}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {[paperAuthorLine(paper), paper.journalName, paper.publicationYear || t("Year not listed")].filter(Boolean).join(" · ")}
                        </span>
                        {paper.externalIds?.doi ? <span className="mt-1 block truncate text-xs text-muted-foreground">DOI: {paper.externalIds.doi}</span> : null}
                      </span>
                      {alreadyAdded ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"><Check className="h-3 w-3" />{t("Already in project")}</span> : null}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-3 px-5 py-4 sm:px-6">
            <span className="text-xs text-muted-foreground">{selectedIds.length ? t("{{count}} selected", { count: selectedIds.length }) : t("Select one or more papers")}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => closePicker(false)} disabled={isAdding}>{t("Cancel")}</Button>
              <Button type="submit" disabled={selectedIds.length === 0 || isAdding}>
                {isAdding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("Adding…")}</> : t("Add selected papers")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
