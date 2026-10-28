import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Inbox, Lock, MoreHorizontal, Pin, Plus, Search, ShieldAlert, Users, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AdminTabs } from "@/components/admin-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { forumApi } from "@/features/forum/api/forum.api";
import { type CommunityView, type ForumPostView, useCommunities, useForumPosts, useModerateForumContent, useSetCommunityStatus } from "@/features/forum";
import { CommunityProposalQueue } from "./community-proposal-queue";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";

type Tab = "communities" | "proposals" | "discussions";
type StatusFilter = "all" | "ACTIVE" | "ARCHIVED" | "REJECTED";
const TABS: Tab[] = ["communities", "proposals", "discussions"];
const TAB_LABELS: Record<Tab, string> = { communities: "Communities", proposals: "Pending proposals", discussions: "Discussions" };
const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [{ value: "all", label: "All" }, { value: "ACTIVE", label: "Active" }, { value: "ARCHIVED", label: "Archived" }, { value: "REJECTED", label: "Rejected" }];
const STATUS_ORDER: Record<CommunityView["status"], number> = { ACTIVE: 0, ARCHIVED: 1, REJECTED: 2, PENDING_APPROVAL: 3 };
const POSTS_PER_PAGE = 30;

export function AdminCommunityPage() {
  const { t } = useI18n(); const [params, setParams] = useSearchParams(); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const requested = params.get("tab"); const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "communities";
  const setTab = (value: Tab) => setParams((previous) => { const next = new URLSearchParams(previous); next.set("tab", value); return next; });
  const changeSearch = (value: string) => { setSearch(value); setPage(1); };
  const viewer = useAuthStore((state) => state.user?.id);
  const communities = useCommunities({ all: true });
  const posts = useForumPosts({ page, pageSize: POSTS_PER_PAGE, query: search || undefined, includeModerated: true }, tab === "discussions");
  const openReports = useQuery({ queryKey: ["admin", "forum", viewer, "open-report-count"], queryFn: () => forumApi.moderationQueue("open") });
  const activeCount = (communities.data ?? []).filter((item) => item.status === "ACTIVE").length;
  const pendingCount = (communities.data ?? []).filter((item) => item.status === "PENDING_APPROVAL").length;
  const searched = useMemo(() => (communities.data ?? []).filter((item) => !search || `${item.name} ${item.description} ${item.researchField ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [communities.data, search]);

  return <div className="space-y-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight">{t("Communities & Forum")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("Manage research communities and forum discussions. Reports are handled in Trust & Safety.")}</p></div><Button asChild><Link to="/communities/new"><Plus className="h-4 w-4" />{t("Create community")}</Link></Button></div>
    <div className="grid gap-4 sm:grid-cols-3"><Metric label={t("Active communities")} value={communities.isSuccess ? activeCount : "—"} icon={Users} /><Metric label={t("Pending proposals")} value={communities.isSuccess ? pendingCount : "—"} icon={Inbox} onClick={() => setTab("proposals")} /><Metric label={t("Open reports")} value={openReports.isSuccess ? openReports.data.length : "—"} icon={ShieldAlert} to="/admin/trust-safety?tab=reports&status=open" /></div>
    <AdminTabs label={t("Administration sections")} value={tab} onChange={setTab} tabs={TABS.map((value) => ({ value, label: t(TAB_LABELS[value]), badge: value === "proposals" ? pendingCount : undefined }))} />
    {tab !== "proposals" ? <label className="relative block max-w-md"><span className="sr-only">{t("Search")}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => changeSearch(event.target.value)} placeholder={t(tab === "communities" ? "Search communities" : "Search discussions")} className="pl-9" /></label> : null}
    {tab === "communities" ? <CommunityAdminList data={searched} loading={communities.isLoading} /> : tab === "proposals" ? <CommunityProposalQueue /> : <DiscussionAdminList data={posts.data?.data ?? []} loading={posts.isLoading} failed={posts.isError} total={posts.data?.meta.total} page={page} totalPages={posts.data?.meta.totalPages ?? 1} onPage={setPage} />}
  </div>;
}

const metricClass = "block w-full rounded-xl border bg-card p-5 text-left";
function Metric({ label, value, icon: Icon, to, onClick }: { label: string; value: number | string; icon: LucideIcon; to?: string; onClick?: () => void }) {
  const body = <><div className="flex items-center justify-between text-sm font-medium text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4 text-blue-700" /></div><div className="mt-2 text-2xl font-bold tabular-nums">{typeof value === "number" ? formatNumber(value) : value}</div></>;
  if (to) return <Link to={to} className={cn(metricClass, "transition-colors hover:bg-muted/40")}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn(metricClass, "transition-colors hover:bg-muted/40")}>{body}</button>;
  return <div className={metricClass}>{body}</div>;
}

function CommunityAdminList({ data, loading }: { data: CommunityView[]; loading: boolean }) {
  const { t } = useI18n(); const update = useSetCommunityStatus(); const [target, setTarget] = useState<CommunityView>(); const [confirmation, setConfirmation] = useState(""); const [filter, setFilter] = useState<StatusFilter>("all");
  const counts = useMemo(() => ({ all: data.length, ACTIVE: data.filter((item) => item.status === "ACTIVE").length, ARCHIVED: data.filter((item) => item.status === "ARCHIVED").length, REJECTED: data.filter((item) => item.status === "REJECTED").length }), [data]);
  const rows = useMemo(() => data.filter((item) => filter === "all" || item.status === filter).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)), [data, filter]);
  async function changeStatus() { if (!target || confirmation !== target.name) return; const next = target.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"; try { await update.mutateAsync({ id: target.id, status: next }); toast.success(t(next === "ACTIVE" ? "Community restored" : "Community archived")); setTarget(undefined); setConfirmation(""); } catch { toast.error(t("Could not update community status.")); } }
  if (loading) return <Loading />;
  return <><div role="group" aria-label={t("Community status")} className="flex flex-wrap gap-2">{STATUS_FILTERS.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} className={cn("min-h-11 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", filter === item.value ? "border-blue-700 bg-blue-700 text-white" : "text-muted-foreground hover:text-foreground")}>{t(item.label)} <span className="tabular-nums opacity-80">{counts[item.value]}</span></button>)}</div>
    <div className="overflow-hidden rounded-xl border bg-card"><div className="divide-y">{rows.length ? rows.map((community) => <div key={community.id} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link to={`/communities/${community.slug}`} className="font-semibold hover:text-blue-700">{community.name}</Link><Badge variant={community.status === "ACTIVE" ? "secondary" : "outline"}>{t(STATUS_LABELS[community.status])}</Badge><Badge variant="outline" className="gap-1 font-normal">{community.visibility === "private" ? <Lock className="h-3 w-3" /> : null}{t(community.visibility === "private" ? "Private" : "Public")}</Badge></div><p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{community.description}</p><p className="mt-2 text-xs text-muted-foreground">{community.memberCount} {t("members")}</p></div><div className="flex items-center gap-2"><Button asChild size="sm" variant="outline" className="min-h-11"><Link to={`/communities/${community.slug}/manage`}>{t("Manage")}</Link></Button>{community.status === "ACTIVE" || community.status === "ARCHIVED" ? <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-11 w-11" aria-label={t("More actions")}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className={community.status === "ACTIVE" ? "text-red-600" : "text-emerald-700"} onSelect={() => { setTarget(community); setConfirmation(""); }}>{community.status === "ACTIVE" ? <Archive className="mr-2 h-4 w-4" /> : <ArchiveRestore className="mr-2 h-4 w-4" />}{t(community.status === "ACTIVE" ? "Archive" : "Restore")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</div></div>) : <Empty text={t("No communities found.")} />}</div></div>
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(undefined); }}><DialogContent><DialogHeader><DialogTitle>{t(target?.status === "ACTIVE" ? "Archive this community?" : "Restore this community?")}</DialogTitle><DialogDescription>{t(target?.status === "ACTIVE" ? "Archived communities become read-only and cannot accept new members." : "Restoring makes the community active again.")}</DialogDescription></DialogHeader><label className="space-y-2 text-sm"><span>{t("Type the community name to confirm")}: <strong>{target?.name}</strong></span><Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label><DialogFooter><Button variant="ghost" onClick={() => setTarget(undefined)}>{t("Cancel")}</Button><Button variant={target?.status === "ACTIVE" ? "destructive" : "default"} disabled={confirmation !== target?.name || update.isPending} onClick={changeStatus}>{t(target?.status === "ACTIVE" ? "Archive community" : "Restore community")}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

function DiscussionAdminList({ data, loading, failed, total, page, totalPages, onPage }: { data: ForumPostView[]; loading: boolean; failed: boolean; total?: number; page: number; totalPages: number; onPage: (page: number) => void }) {
  const { t } = useI18n();
  const moderate = useModerateForumContent();
  const [target, setTarget] = useState<ForumPostView>();
  const [reason, setReason] = useState("");
  async function hide() {
    if (!target || reason.trim().length < 3) return;
    try {
      await moderate.mutateAsync({ targetType: "post", targetId: target.id, action: target.status === "hidden" ? "THREAD_RESTORED" : "THREAD_HIDDEN", reason: reason.trim() });
      toast.success(t(target.status === "hidden" ? "Discussion restored" : "Discussion hidden")); setTarget(undefined); setReason("");
    } catch { toast.error(t("Could not moderate this discussion.")); }
  }
  if (loading) return <Loading />;
  if (failed && !data.length) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{t("Could not load discussions.")}</p>;
  return <>{total !== undefined ? <p className="text-sm text-muted-foreground"><span className="tabular-nums">{formatNumber(total)}</span> {t(total === 1 ? "discussion" : "discussions")}</p> : null}
    <div className="overflow-hidden rounded-xl border bg-card"><div className="divide-y">{data.length ? data.map((post) => <div key={post.id} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(post.type)}</Badge>{post.isPinned ? <Badge variant="secondary">{t("Pinned")}</Badge> : null}{post.status === "locked" ? <Badge variant="secondary">{t("Locked")}</Badge> : null}{post.status === "hidden" ? <Badge variant="destructive">{t("Hidden")}</Badge> : null}</div><Link to={`/forum/${post.id}`} className="mt-2 block truncate font-semibold hover:text-blue-700">{post.title}</Link><p className="mt-1 text-xs text-muted-foreground">{post.author.fullName} · {post.commentCount} {t("responses")}</p></div><div className="flex flex-wrap gap-1">{post.status !== "hidden" ? <><Button size="sm" variant="ghost" disabled={moderate.isPending} onClick={() => moderate.mutate({ targetType: "post", targetId: post.id, action: post.isPinned ? "THREAD_UNPINNED" : "THREAD_PINNED" })}><Pin className="h-4 w-4" />{t(post.isPinned ? "Unpin" : "Pin")}</Button><Button size="sm" variant="ghost" disabled={moderate.isPending} onClick={() => moderate.mutate({ targetType: "post", targetId: post.id, action: post.status === "locked" ? "THREAD_UNLOCKED" : "THREAD_LOCKED" })}><Lock className="h-4 w-4" />{t(post.status === "locked" ? "Unlock" : "Lock")}</Button></> : null}<Button size="sm" variant="ghost" className={post.status === "hidden" ? "text-emerald-700" : "text-red-600"} onClick={() => setTarget(post)}>{t(post.status === "hidden" ? "Restore" : "Hide")}</Button></div></div>) : <Empty text={t("No discussions found.")} />}</div></div>
    {totalPages > 1 ? <div className="flex items-center justify-between gap-3"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("Previous")}</Button><span className="text-sm text-muted-foreground tabular-nums">{t("Page")} {page} / {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>{t("Next")}</Button></div> : null}
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(undefined); }}><DialogContent><DialogHeader><DialogTitle>{t(target?.status === "hidden" ? "Restore this discussion?" : "Hide this discussion?")}</DialogTitle><DialogDescription>{t(target?.status === "hidden" ? "The discussion will return to the forum." : "It will leave the public feed and the action will be recorded in moderation history.")}</DialogDescription></DialogHeader><label className="space-y-2 text-sm"><span>{t("Moderation reason")}</span><textarea rows={4} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2" /></label><DialogFooter><Button variant="ghost" onClick={() => setTarget(undefined)}>{t("Cancel")}</Button><Button variant={target?.status === "hidden" ? "default" : "destructive"} disabled={reason.trim().length < 3 || moderate.isPending} onClick={hide}>{t(target?.status === "hidden" ? "Restore discussion" : "Hide discussion")}</Button></DialogFooter></DialogContent></Dialog></>;
}

const STATUS_LABELS: Record<CommunityView["status"], string> = { ACTIVE: "Active", ARCHIVED: "Archived", PENDING_APPROVAL: "Pending", REJECTED: "Rejected" };

function Loading() { return <div className="space-y-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>; }
function Empty({ text }: { text: string }) { return <div className="py-14 text-center text-sm text-muted-foreground">{text}</div>; }
