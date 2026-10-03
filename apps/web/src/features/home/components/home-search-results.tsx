import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { Paper, ScoredPaper } from "@trend/shared-types";
import { PaperCard } from "@/components/paper-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { searchApi } from "@/features/search/api/search.api";
import { papersApi } from "@/features/papers/api/papers.api";
import { useBookmarks } from "@/features/bookmarks/hooks/use-bookmarks";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { homePaperKeywords, homeSearchRequest, LITERATURE_PATH } from "../utils/home-search";

export function HomeSearchResults() {
  const [params, setParams] = useSearchParams();
  const { t, language } = useI18n();
  const authenticated = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const userId = useAuthStore((state) => state.user?.id);
  const client = useQueryClient();
  const { mode, request } = homeSearchRequest(params);
  const needsSignIn = Boolean(request.rerank && !authenticated);
  const invalidQuery = request.q.length > 500;
  const results = useQuery({
    queryKey: ["home", "literature", authenticated ? userId : "guest", mode, request],
    queryFn: async ({ signal }) => {
      const data = mode === "semantic" ? await searchApi.semantic(request, signal) : await papersApi.list(request, signal);
      void client.invalidateQueries({ queryKey: ["analytics", "summary"] });
      if (request.rerank) void client.invalidateQueries({ queryKey: ["credits"] });
      return data;
    },
    enabled: !needsSignIn && !invalidQuery, retry: false, staleTime: 30_000, refetchOnWindowFocus: false,
  });
  const bookmarks = useBookmarks({ enabled: authenticated });
  const bookmarkByPaper = new Map(bookmarks.data?.filter((bookmark) => bookmark.targetKind === "paper").map((bookmark) => [bookmark.targetId, bookmark.id]));
  const papers = (results.data?.papers ?? []) as Array<Paper & Partial<ScoredPaper>>;
  const meta = results.data?.meta;
  const totalPages = Math.max(1, meta?.totalPages ?? 1);
  useEffect(() => {
    if (meta && request.page! > totalPages) setParams((previous) => { const next = new URLSearchParams(previous); next.set("page", String(totalPages)); return next; }, { replace: true });
  }, [meta, request.page, totalPages, setParams]);

  function update(key: string, value: string) {
    setParams((previous) => { const next = new URLSearchParams(previous); next.set(key, value); if (key !== "page") next.delete("page"); return next; });
  }
  const keywordParams = new URLSearchParams(params); keywordParams.set("mode", "keyword"); keywordParams.delete("rerank"); keywordParams.delete("minScore"); keywordParams.delete("page");
  const withoutRerank = new URLSearchParams(params); withoutRerank.delete("rerank");

  return <section id="home-search-results" className="home-search-results home-width" aria-labelledby="home-search-results-heading" data-no-i18n>
    <header className="home-search-results-header">
      <div><p className="home-section-kicker">{t(mode === "semantic" ? "Semantic" : "Keyword")}</p><h1 id="home-search-results-heading">{t(request.q ? "Literature for “{{query}}”" : "Explore the literature", { query: request.q })}</h1><p aria-live="polite">{results.isPending && !needsSignIn && !invalidQuery ? t("Searching literature…") : meta ? t("{{count}} papers found", { count: meta.total.toLocaleString(language) }) : null}</p></div>
      <label className="home-search-sort"><span>{t("Sort by:")}</span><select value={request.sort} onChange={(event) => update("sort", event.target.value)}><option value="relevance">{t("Relevance")}</option><option value="year">{t("Newest first")}</option><option value="citations">{t("Most cited")}</option></select></label>
    </header>
    {invalidQuery ? <div className="home-search-state" role="alert"><p>{t("Search queries can contain at most 500 characters.")}</p></div>
      : needsSignIn ? <div className="home-search-state" role="status"><p>{t("Sign in to use AI reranking.")}</p><div><Button asChild><Link to={"/login?returnTo=" + encodeURIComponent(LITERATURE_PATH + "?" + params.toString())}>{t("Sign in")}</Link></Button><Button asChild variant="outline"><Link to={LITERATURE_PATH + "?" + withoutRerank.toString()}>{t("Search without AI reranking")}</Link></Button></div></div>
      : results.isPending ? <div role="status" aria-label={t("Searching literature…")} className="home-search-list">{[0, 1, 2].map((item) => <div key={item} className="home-search-skeleton"><Skeleton className="h-6 w-4/5" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-14 w-full" /></div>)}</div>
      : results.isError ? <div className="home-search-state" role="alert"><p>{t("Could not load search results. Please try again.")}</p><div><Button onClick={() => { void results.refetch(); }}>{t("Retry")}</Button>{mode === "semantic" ? <Button asChild variant="outline"><Link to={LITERATURE_PATH + "?" + keywordParams.toString()}>{t("Try keyword search")}</Link></Button> : null}</div></div>
      : papers.length === 0 ? <div className="home-search-state" role="status"><Search aria-hidden="true" /><h3>{t("No matching papers found.")}</h3><p>{t("Try a broader query or change your filters.")}</p>{mode === "semantic" ? <Button asChild variant="outline"><Link to={LITERATURE_PATH + "?" + keywordParams.toString()}>{t("Try keyword search")}</Link></Button> : null}</div>
      : <div className="home-search-list">{papers.map((paper) => <PaperCard key={paper.id} id={paper.id} title={paper.title} authors={paper.authors?.slice(0, 3).map((author) => author.displayName).join(", ") || t("Authors unavailable")} journal={paper.journalName || t("Journal unavailable")} abstract={paper.abstractText || t("No abstract available for this paper.")} score={paper.score?.toFixed(2) ?? "N/A"} doi={paper.externalIds?.doi} keywords={homePaperKeywords(paper.keywords)} publicationYear={paper.publicationYear} citationCount={paper.citationCount} primaryProvider={paper.primaryProvider} language={paper.language} paperKind={paper.paperKind} openAccessUrl={paper.openAccessUrl} dataQualityScore={paper.dataQualityScore} aiScore={paper.aiScore?.finalScore} rerankScore={paper.rerankScore} taxonomyBoostScore={paper.taxonomyBoostScore} searchMode={mode} showBookmark={authenticated} isBookmarked={bookmarkByPaper.has(paper.id)} bookmarkId={bookmarkByPaper.get(paper.id)} />)}</div>}
    {meta && !results.isError && !results.isPending && totalPages > 1 ? <nav className="home-search-pagination" aria-label={t("Search result pages")}><Button variant="outline" disabled={request.page === 1} onClick={() => update("page", String(request.page! - 1))}><ChevronLeft aria-hidden="true" />{t("Previous")}</Button><span>{t("Page {{page}} of {{total}}", { page: request.page, total: totalPages })}</span><Button variant="outline" disabled={request.page! >= totalPages} onClick={() => update("page", String(request.page! + 1))}>{t("Next")}<ChevronRight aria-hidden="true" /></Button></nav> : null}
  </section>;
}
