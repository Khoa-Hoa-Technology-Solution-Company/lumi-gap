import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, LockKeyhole, MessageSquare, Plus, Search, Sparkles, Users } from "lucide-react";
import type { CommunitySort } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/features/auth";
import { canProposeCommunity, useCommunityFacets, useCommunityList, useCommunityRecommendations, type CommunityView } from "@/features/forum";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

type Scope = "all" | "mine";

const SORT_OPTIONS: Array<{ value: CommunitySort; label: string }> = [
  { value: "recent", label: "Recently active" },
  { value: "newest", label: "Newest" },
  { value: "members", label: "Most members" },
  { value: "discussions", label: "Most discussions" },
  { value: "name", label: "Name (A–Z)" },
];

export function CommunityListPage() {
  const { t } = useI18n();
  const { data: currentUser } = useCurrentUser();
  const user = currentUser?.user;
  const canCreate = canProposeCommunity(user);

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [field, setField] = useState<string>();
  const [sort, setSort] = useState<CommunitySort>("recent");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const list = useCommunityList({ q: debouncedQuery || undefined, field, sort, scope });
  const facets = useCommunityFacets();
  const isFiltering = Boolean(debouncedQuery || field || scope === "mine");
  const recommendations = useCommunityRecommendations(Boolean(user) && !isFiltering);

  const communities = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const recommended = recommendations.data ?? [];

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{t("Research fields")}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{t("Research Communities")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("Join focused spaces for questions and discussions in your area of research.")}</p>
      </div>
      {canCreate ? <Button asChild className="gap-2 self-start sm:self-auto"><Link to="/communities/new"><Plus className="h-4 w-4" />{t("Create community")}</Link></Button> : null}
    </header>

    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex w-fit rounded-lg bg-muted p-1" aria-label={t("Community scope")}>
        {(["all", "mine"] as const).map((value) => <button key={value} type="button" onClick={() => setScope(value)} disabled={value === "mine" && !user}
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40", scope === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {t(value === "all" ? "All communities" : "My communities")}
        </button>)}
      </div>
      <div className="flex w-full flex-col gap-3 sm:max-w-xl sm:flex-row">
        <label className="relative flex-1"><span className="sr-only">{t("Search communities")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search by name, field, or research topic")} className="pl-9" />
        </label>
        <label><span className="sr-only">{t("Sort by")}</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as CommunitySort)} className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
          </select>
        </label>
      </div>
    </div>

    {facets.data?.length ? <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("Filter by research field")}>
      <FieldChip active={!field} onClick={() => setField(undefined)}>{t("All fields")}</FieldChip>
      {facets.data.map((facet) => <FieldChip key={facet.name} active={field === facet.name} onClick={() => setField(field === facet.name ? undefined : facet.name)}>{facet.name} <span className="tabular-nums opacity-70">{facet.count}</span></FieldChip>)}
    </div> : null}

    {recommended.length && !isFiltering ? <section className="mt-7" aria-labelledby="recommended-communities">
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-700" /><h2 id="recommended-communities" className="text-sm font-semibold">{t("Recommended for you")}</h2></div>
      <p className="mt-1 text-xs text-muted-foreground">{t("Based on the research interests in your academic profile.")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recommended.map((community) => <Link key={community.id} to={`/communities/${community.slug}`} className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <h3 className="font-semibold">{community.name}</h3>
          {community.researchField ? <p className="mt-1 text-xs font-medium text-blue-700">{community.researchField}</p> : null}
          <div className="mt-3 flex flex-wrap gap-1.5">{community.matchedInterests.slice(0, 3).map((interest) => <Badge key={interest} variant="secondary" className="font-normal">{interest}</Badge>)}</div>
        </Link>)}
      </div>
    </section> : null}

    {list.isLoading ? <div className="mt-7 divide-y overflow-hidden rounded-xl border bg-card">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-36 animate-pulse bg-muted/40" />)}</div>
      : list.error ? <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{t("Unable to load communities. Please try again.")}</div>
        : communities.length ? <>
          <div className="mt-7 divide-y overflow-hidden rounded-xl border bg-card">{communities.map((community) => <CommunityRow key={community.id} community={community} t={t} />)}</div>
          <div className="mt-5 flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">{communities.length} / {total}</p>
            {list.hasNextPage ? <Button variant="outline" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t(list.isFetchingNextPage ? "Loading…" : "Load more")}</Button> : null}
          </div>
        </>
          : <div className="mt-7 rounded-xl border border-dashed px-6 py-14 text-center">
            <h2 className="font-semibold">{t(scope === "mine" && !debouncedQuery && !field ? "You haven't joined any research communities yet." : "No communities found")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t(isFiltering ? "Try a broader name or research topic." : "New research communities will appear here.")}</p>
            {debouncedQuery || field ? <Button type="button" variant="outline" className="mt-4" onClick={() => { setQuery(""); setField(undefined); }}>{t("Clear filters")}</Button> : null}
          </div>}
  </main>;
}

function FieldChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active}
    className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-blue-700 bg-blue-700 text-white" : "text-muted-foreground hover:border-blue-300 hover:text-foreground")}>{children}</button>;
}

function CommunityRow({ community, t }: { community: CommunityView; t: (key: string) => string }) {
  const status = STATUS_BADGES[community.status];
  return <Link to={`/communities/${community.slug}`} className="group grid gap-4 p-5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold group-hover:text-blue-700">{community.name}</h2>
        {community.visibility === "private" ? <Badge variant="outline" className="gap-1 font-normal"><LockKeyhole className="h-3 w-3" />{t("Private")}</Badge> : null}
        {status ? <Badge variant="outline" className={cn("font-normal", status.className)}>{t(status.label)}</Badge> : null}
        {community.viewerMembership?.status === "active" ? <Badge className="gap-1 border-emerald-200 bg-emerald-50 font-normal text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" />{t("Joined")}</Badge> : null}
      </div>
      {community.researchField ? <p className="mt-1 text-xs font-medium text-blue-700">{community.researchField}</p> : null}
      <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground">{community.description || t("A focused space for researchers working in this field.")}</p>
      {community.researchTopics.length ? <div className="mt-3 flex flex-wrap gap-1.5">{community.researchTopics.slice(0, 5).map((topic) => <Badge key={topic} variant="secondary" className="font-normal">{topic}</Badge>)}</div> : null}
    </div>
    <div className="flex gap-4 text-sm text-muted-foreground sm:justify-end">
      <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /><span className="tabular-nums">{community.memberCount}</span><span>{t(community.memberCount === 1 ? "member" : "members")}</span></span>
      <span className="inline-flex items-center gap-1.5"><MessageSquare className="h-4 w-4" /><span className="tabular-nums">{community.threadCount}</span><span>{t(community.threadCount === 1 ? "discussion" : "discussions")}</span></span>
    </div>
  </Link>;
}

const STATUS_BADGES: Partial<Record<CommunityView["status"], { label: string; className: string }>> = {
  PENDING_APPROVAL: { label: "Pending", className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" },
  REJECTED: { label: "Rejected", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" },
  ARCHIVED: { label: "Archived", className: "text-muted-foreground" },
};
