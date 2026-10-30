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
export type PaperPickerSource = "search" | "library" | "doi";
const sources = [
  { value: "search", label: "Search LumiGap", icon: Search },
  { value: "library", label: "My Library", icon: BookMarked },
  { value: "doi", label: "Add by DOI", icon: FileSearch },
] as const;

function paperAuthorLine(paper: Paper) {
  const names = paper.authors?.map((author) => author.displayName).filter(Boolean) ?? [];
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} et al.` : names.join(", ");
}

export function ProjectPaperPickerDialog({
  projectId,
  papers,
  open,
  onOpenChange,
  initialSource = "search",
  readOnly = false,
}: {
  projectId: string;
  papers: IProject["papers"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSource?: PaperPickerSource;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const [source, setSource] = useState<PaperPickerSource>(initialSource);
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const addPaper = useAddPaperToProject(projectId);
  const [proposalReason, setProposalReason] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const queryText = searchText.trim();
  const normalizedDoi = source === "doi" ? normalizeDoi(queryText) : "";
  const validDoi = source === "doi" && isValidDoi(queryText);
  const effectiveSearchQuery = source === "doi" ? normalizedDoi : queryText;
  useEffect(() => {
    if (open) {
      setProposalReason("");
      setSource(initialSource);
      setSearchText("");
      setSearchQuery("");
      setSelectedIds([]);
    }
  }, [open, initialSource]);
  useEffect(() => {
    if (!open || readOnly || source === "library" || queryText.length < 3 || (source === "doi" && !validDoi)) {
      setSearchQuery("");
      return;
    }
    const timer = window.setTimeout(() => setSearchQuery(effectiveSearchQuery), 250);
    return () => window.clearTimeout(timer);
  }, [effectiveSearchQuery, queryText.length, source, validDoi, open, readOnly]);
  const search = useQuery({
    queryKey: ["projectPaperPickerSearch", searchQuery],
    queryFn: async ({ signal }) => (await papersApi.list({ q: searchQuery, page: 1, pageSize: 12 }, signal)).papers as PaperSearchHit[],
    enabled: open && !readOnly && source !== "library" && searchQuery.length >= 3 && (source !== "doi" || validDoi),
    staleTime: 30_000,
  });
  const bookmarks = useBookmarks({ enabled: open && !readOnly && source === "library" });
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
      let unavailable = 0;
      for (let index = 0; index < libraryIds.length; index += 8) {
        const batch = await Promise.all(libraryIds.slice(index, index + 8).map(async (paperId) => {
          try { return await papersApi.detail(paperId); } catch { return null; }
        }));
        loaded.push(...batch.filter((paper): paper is Paper => paper !== null));
        unavailable += batch.filter(paper => paper === null).length;
      }
      return { papers: loaded, unavailable };
    },
    enabled: open && !readOnly && source === "library" && !bookmarks.isLoading && !bookmarks.isError,
    staleTime: 60_000,
  });

  useEffect(() => {
    setSelectedIds([]);
  }, [source, queryText]);

  const closePicker = (nextOpen: boolean) => {
    if (!nextOpen && isAdding) return;
    if (!nextOpen) {
      setSearchText("");
      setSearchQuery("");
      setSelectedIds([]);
      setSource("search");
    }
    onOpenChange(nextOpen);
  };

  const results = source === "library"
    ? (library.data?.papers ?? []).filter(paper => [paper.title, paperAuthorLine(paper), paper.journalName, paper.externalIds?.doi].some(value => value?.toLocaleLowerCase().includes(queryText.toLocaleLowerCase())))
    : source === "doi"
      ? (search.data ?? []).filter((paper) => matchesExactDoi(paper.externalIds?.doi, normalizedDoi))
      : search.data ?? [];
  const isLoading = source === "library" ? bookmarks.isLoading || library.isLoading : search.isLoading;
  const isError = source === "library" ? bookmarks.isError || library.isError : search.isError;
  const waitingForDebounce = source !== "library" && queryText.length >= 3 && (source !== "doi" || validDoi) && searchQuery !== effectiveSearchQuery;

  const togglePaper = (paperId: string) => {
    setSelectedIds((current) => current.includes(paperId) ? current.filter((id) => id !== paperId) : [...current, paperId]);
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly || !selectedIds.length || isAdding) return;
    setIsAdding(true);
    let added = 0;
    const failed: string[] = [];
    for (const paperId of selectedIds) {
      try {
        await addPaper.mutateAsync({ paperId, ...(proposalReason.trim() ? { proposalReason: proposalReason.trim() } : {}) });
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
    <Dialog open={open && !readOnly} onOpenChange={closePicker}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl" data-no-i18n>
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <DialogTitle>{t("Add papers to this project")}</DialogTitle>
          <DialogDescription>{t("Find literature in LumiGap or choose papers saved to your library.")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-1 border-b px-3 pt-2 sm:px-4" role="group" aria-label={t("Paper source")}>
          {sources.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={source === value}
              disabled={isAdding}
              onClick={() => { setSource(value); setSearchText(""); setSearchQuery(""); }}
              className={`inline-flex items-center justify-center gap-2 border-b-2 px-1 py-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:px-3 sm:text-sm ${source === value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="hidden h-4 w-4 shrink-0 sm:block" />{t(label)}
            </button>
          ))}
        </div>

        <form onSubmit={handleAdd} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 px-5 py-4 sm:px-6">
            <Label htmlFor="project-paper-search">{t(source === "doi" ? "DOI" : source === "library" ? "Filter saved papers" : "Search papers")}</Label>
            <div className="relative">
              {source === "doi" ? <FileSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /> : <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
              <Input
                id="project-paper-search"
                className="pl-9"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t(source === "doi" ? "Paste a DOI or doi.org link" : source === "library" ? "Filter by title, author, or DOI" : "Search by title, author, or keyword")}
                autoComplete="off"
                autoFocus
                disabled={isAdding}
              />
            </div>
            {source === "doi" ? <p className="text-xs text-muted-foreground">{t("Looks for an exact DOI already indexed in LumiGap. This will not create a paid paper request.")}</p> : null}
            {source === "doi" && queryText.length > 0 && !validDoi ? <p className="text-xs text-destructive">{t("Enter a valid DOI, such as 10.1234/example.")}</p> : null}
            {source !== "library" && source !== "doi" && queryText.length < 3 ? <p className="text-xs text-muted-foreground">{t("Type at least 3 characters to search.")}</p> : null}
            {source === "library" ? <p className="text-xs text-muted-foreground">{t("Saved papers that are not already in this project.")}</p> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-y px-5 py-3 sm:px-6">
            {source === "library" && Boolean(library.data?.unavailable) ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted p-3 text-xs"><p>{t("Some saved papers could not be loaded.")}</p><Button type="button" variant="ghost" size="sm" disabled={isAdding} onClick={retry}>{t("Try again")}</Button></div> : null}
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
            ) : results.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {source === "library" ? t(queryText ? "No saved papers match this filter." : "No saved papers are available to add.") : source === "doi" ? t("No paper with this DOI is indexed in LumiGap yet.") : t("No papers found. Try a broader search.")}
              </div>
            ) : (
              <div className="divide-y">
                {results.map((paper) => {
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

          <label data-no-i18n className="grid gap-2 px-5 text-sm sm:px-6">Lý do đề xuất (không bắt buộc)<textarea className="rounded-md border border-input bg-background px-3 py-2" rows={2} maxLength={2000} value={proposalReason} onChange={e => setProposalReason(e.target.value)} disabled={isAdding} placeholder="Các bài này giúp trả lời câu hỏi nghiên cứu nào? Có thể bổ sung lý do riêng cho từng bài sau khi thêm." /></label>
          <DialogFooter className="shrink-0 flex-col items-stretch gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="text-xs text-muted-foreground">{selectedIds.length ? t("{{count}} selected", { count: selectedIds.length }) : t("Select one or more papers")}</span>
            <div className="flex flex-wrap gap-2">
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
