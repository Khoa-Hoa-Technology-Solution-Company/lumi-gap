import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ForumPostType, ForumSort } from "@trend/shared-types";
import { BadgeCheck, BookOpen, ChevronLeft, ChevronRight, FileText, MessageSquare, Pin, Plus, Search, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ForumPostView, useCommunities, useForumPosts } from "@/features/forum";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";

const PAGE_SIZE = 20;
const TYPES: ForumPostType[] = ["QUESTION", "DISCUSSION", "PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"];
const TABS: Array<{ value: ForumSort; label: string }> = [{ value: "latest", label: "Latest" }, { value: "unanswered", label: "Unanswered" }, { value: "popular", label: "Popular" }, { value: "following", label: "Following" }];

function relativeTime(value: string, locale: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000); const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second"); const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute"); const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour"); return formatter.format(Math.round(hours / 24), "day");
}

function DiscussionRow({ post, locale, t }: { post: ForumPostView; locale: string; t: (key: string) => string }) {
  const context = post.references[0];
  return <article className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 px-4 py-5 hover:bg-muted/25 sm:grid-cols-[56px_minmax(0,1fr)] sm:px-5">
    <div className="pt-1 text-center"><span className="block text-base font-semibold tabular-nums">{post.voteScore}</span><span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("helpful")}</span></div>
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="h-5 rounded px-1.5 text-[10px]">{t(post.type)}</Badge>{post.isPinned ? <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700"><Pin className="h-3 w-3" />{t("Pinned")}</span> : null}{post.community ? <Link to={`/communities/${post.community.slug}`} className="ml-auto truncate text-xs font-medium text-muted-foreground hover:text-foreground">{post.community.name}</Link> : null}</div>
      <Link to={`/forum/${post.id}`} className="mt-2 block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><h2 className="text-base font-semibold leading-snug tracking-tight hover:text-blue-700 sm:text-[17px]">{post.title}</h2></Link>
      <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">{post.content}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">{post.author.fullName}</span>{post.author.academicTitle ? <span>{post.author.academicTitle}</span> : null}{post.author.institution ? <span>· {post.author.institution}</span> : null}{post.author.affiliationVerified ? <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />{t("Affiliation verified")}</span> : null}<span>· {relativeTime(post.createdAt, locale)}</span>{post.editedAt ? <span>· {t("Edited")}</span> : null}</div>
      {context ? <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /><div className="min-w-0"><p className="truncate text-xs font-medium">{context.title || context.doi}</p><p className="text-[11px] text-muted-foreground">{[context.year, context.doi].filter(Boolean).join(" · ")}</p></div></div> : null}
      <div className="mt-3 flex flex-wrap gap-1.5">{post.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{tag}</span>)}</div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />{post.commentCount} {t("responses")}</span><span className="inline-flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" />{post.references.length} {t("citations")}</span></div>
    </div>
  </article>;
}

export function ForumListPage() {
  const { t, language } = useI18n(); const isAuthed = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const [page, setPage] = useState(1); const [query, setQuery] = useState(""); const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<ForumSort>("latest"); const [type, setType] = useState<ForumPostType | "">(""); const [communityId, setCommunityId] = useState(""); const [tag, setTag] = useState("");
  const { data, isLoading, isError } = useForumPosts({ page, pageSize: PAGE_SIZE, query: deferredQuery || undefined, sort, type: type || undefined, communityId: communityId || undefined, tag: tag || undefined }, sort !== "following" || isAuthed);
  const { data: communities } = useCommunities();
  const joined = useMemo(() => (communities ?? []).filter((community) => community.viewerMembership?.status === "active"), [communities]);
  const popularTags = useMemo(() => { const counts = new Map<string, number>(); for (const post of data?.data ?? []) for (const item of post.tags) counts.set(item, (counts.get(item) ?? 0) + 1); return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([item]) => item); }, [data?.data]);
  const unanswered = useMemo(() => (data?.data ?? []).filter((post) => post.commentCount === 0).slice(0, 4), [data?.data]);
  const clear = () => { setQuery(""); setType(""); setCommunityId(""); setTag(""); setPage(1); };
  const hasFilters = Boolean(query || type || communityId || tag);

  return <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">{t("Research Forum")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("Questions and evidence-led discussions connected to papers, research gaps, and academic research.")}</p></div><div className="flex gap-2"><Button variant="outline" asChild><Link to="/communities"><Users className="h-4 w-4" />{t("Communities")}</Link></Button>{isAuthed ? <Button asChild><Link to="/forum/new"><Plus className="h-4 w-4" />{t("New discussion")}</Link></Button> : null}</div></header>
    <nav className="mt-5 flex gap-1 overflow-x-auto border-b" aria-label={t("Forum views")}>{TABS.map((tab) => <button key={tab.value} type="button" disabled={tab.value === "following" && !isAuthed} onClick={() => { setSort(tab.value); setPage(1); }} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", sort === tab.value ? "border-blue-700 text-blue-700" : "border-transparent text-muted-foreground hover:text-foreground", tab.value === "following" && !isAuthed && "cursor-not-allowed opacity-50")}>{t(tab.label)}</button>)}</nav>
    <section className="mt-4 grid gap-2 rounded-lg border bg-card p-3 lg:grid-cols-[minmax(260px,1fr)_190px_210px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t("Search discussions, papers, DOI, topics...")} className="pl-9" /></div><select value={communityId} onChange={(event) => { setCommunityId(event.target.value); setPage(1); }} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label={t("Community")}><option value="">{t("All communities")}</option>{communities?.map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}</select><select value={type} onChange={(event) => { setType(event.target.value as ForumPostType | ""); setPage(1); }} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label={t("Thread type")}><option value="">{t("All thread types")}</option>{TYPES.map((item) => <option key={item} value={item}>{t(item)}</option>)}</select>{hasFilters ? <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground lg:col-span-3 lg:justify-self-end"><X className="h-3.5 w-3.5" />{t("Clear filters")}</button> : null}</section>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)]"><section className="overflow-hidden rounded-xl border bg-card" aria-live="polite">{isLoading ? <div className="divide-y">{[0,1,2].map((item) => <div key={item} className="h-48 animate-pulse bg-muted/40" />)}</div> : isError ? <Empty title={t("Could not load discussions.")} detail={t("Please try again in a moment.")} /> : data?.data.length ? <div className="divide-y">{data.data.map((post) => <DiscussionRow key={post.id} post={post} locale={language} t={t} />)}</div> : <Empty title={t("No discussions yet.")} detail={t("Start a research question or share a topic for academic discussion.")} action={isAuthed ? <Button asChild size="sm"><Link to="/forum/new">{t("New discussion")}</Link></Button> : undefined} />}
      {data?.meta ? <footer className="flex items-center justify-between border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground"><span>{data.meta.total} {t("discussions")}</span><div className="flex items-center gap-2"><Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label={t("Previous page")}><ChevronLeft className="h-4 w-4" /></Button><span>{page} / {data.meta.totalPages}</span><Button variant="outline" size="icon" disabled={page >= data.meta.totalPages} onClick={() => setPage((value) => value + 1)} aria-label={t("Next page")}><ChevronRight className="h-4 w-4" /></Button></div></footer> : null}</section>
      <aside className="space-y-6"><Sidebar title={t("Joined Communities")}>{joined.length ? joined.slice(0, 5).map((community) => <Link key={community.id} to={`/communities/${community.slug}`} className="flex items-center justify-between py-2 text-sm hover:text-blue-700"><span>{community.name}</span><span className="text-xs text-muted-foreground">{community.threadCount}</span></Link>) : <p className="text-sm text-muted-foreground">{t("You haven't joined any research communities yet.")} <Link to="/communities" className="font-medium text-blue-700">{t("Explore communities")}</Link></p>}</Sidebar>
        <Sidebar title={t("Popular Topics")}><div className="flex flex-wrap gap-2">{popularTags.map((item) => <button key={item} type="button" onClick={() => { setTag(item); setPage(1); }} className={cn("rounded-md border px-2 py-1 text-xs", tag === item ? "border-blue-700 bg-blue-50 text-blue-700" : "text-muted-foreground hover:text-foreground")}>{item}</button>)}</div></Sidebar>
        <Sidebar title={t("Unanswered Questions")}>{unanswered.length ? unanswered.map((post) => <Link key={post.id} to={`/forum/${post.id}`} className="block border-b py-2 text-sm leading-5 last:border-0 hover:text-blue-700">{post.title}</Link>) : <p className="text-sm text-muted-foreground">{t("No unanswered questions in this view.")}</p>}</Sidebar>
      </aside></div>
  </main>;
}

function Sidebar({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-b pb-5"><h2 className="text-sm font-semibold">{title}</h2><div className="mt-2">{children}</div></section>; }
function Empty({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <div className="px-6 py-16 text-center"><MessageSquare className="mx-auto h-7 w-7 text-muted-foreground" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{detail}</p>{action ? <div className="mt-5">{action}</div> : null}</div>; }
