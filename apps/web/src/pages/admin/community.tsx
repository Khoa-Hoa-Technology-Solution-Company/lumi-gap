import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArchiveRestore, Lock, MessageSquare, Pin, Plus, Search, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ForumModerationQueue } from "@/features/forum/components/forum-moderation-queue";
import { type CommunityView, type ForumPostView, useCommunities, useForumPosts, useModerateForumContent, useUpdateCommunity } from "@/features/forum";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";

type Tab = "communities" | "discussions" | "moderation";

export function AdminCommunityPage() {
  const { t } = useI18n(); const [tab, setTab] = useState<Tab>("communities"); const [search, setSearch] = useState("");
  const communities = useCommunities(); const posts = useForumPosts({ page: 1, pageSize: 100, query: search || undefined, includeModerated: true });
  const visibleCommunities = useMemo(() => (communities.data ?? []).filter((item) => !search || `${item.name} ${item.description} ${item.researchField ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [communities.data, search]);
  const activeCount = (communities.data ?? []).filter((item) => item.status === "ACTIVE").length;

  return <div className="space-y-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight">{t("Research Communities & Forum")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("Create and archive research communities, assign moderators, and review reported forum content.")}</p></div><Button asChild><Link to="/communities/new"><Plus className="h-4 w-4" />{t("Create community")}</Link></Button></div>
    <div className="grid gap-4 sm:grid-cols-3"><Metric label={t("Active Communities")} value={activeCount} icon={Users} /><Metric label={t("Forum Discussions")} value={posts.data?.meta.total ?? 0} icon={MessageSquare} /><Metric label={t("Moderation scope")} value={t("Platform-wide")} icon={ShieldAlert} /></div>
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label={t("Administration sections")}>{(["communities", "discussions", "moderation"] as const).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === value ? "border-blue-700 text-blue-700" : "border-transparent text-muted-foreground hover:text-foreground")}>{t(value === "communities" ? "Communities" : value === "discussions" ? "Discussions" : "Moderation Queue")}</button>)}</nav>
    {tab !== "moderation" ? <label className="relative block max-w-md"><span className="sr-only">{t("Search")}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(tab === "communities" ? "Search communities" : "Search discussions")} className="pl-9" /></label> : null}
    {tab === "communities" ? <CommunityAdminList data={visibleCommunities} loading={communities.isLoading} /> : tab === "discussions" ? <DiscussionAdminList data={posts.data?.data ?? []} loading={posts.isLoading} /> : <ForumModerationQueue />}
  </div>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof Users }) { return <div className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between text-sm font-medium text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4 text-blue-700" /></div><div className="mt-2 text-2xl font-bold tabular-nums">{typeof value === "number" ? formatNumber(value) : value}</div></div>; }

function CommunityAdminList({ data, loading }: { data: CommunityView[]; loading: boolean }) {
  const { t } = useI18n(); const update = useUpdateCommunity(); const [target, setTarget] = useState<CommunityView>(); const [confirmation, setConfirmation] = useState("");
  async function changeStatus() { if (!target || confirmation !== target.name) return; const next = target.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"; try { await update.mutateAsync({ id: target.id, input: { status: next } }); toast.success(t(next === "ACTIVE" ? "Community restored" : "Community archived")); setTarget(undefined); setConfirmation(""); } catch { toast.error(t("Could not update community status.")); } }
  if (loading) return <Loading />;
  return <><div className="overflow-hidden rounded-xl border bg-card"><div className="divide-y">{data.length ? data.map((community) => <div key={community.id} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link to={`/communities/${community.slug}`} className="font-semibold hover:text-blue-700">{community.name}</Link><Badge variant={community.status === "ACTIVE" ? "secondary" : "outline"}>{t(community.status === "ACTIVE" ? "Active" : "Archived")}</Badge></div><p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{community.description}</p><p className="mt-2 text-xs text-muted-foreground">{community.memberCount} {t("members")} · {community.threadCount} {t("discussions")}</p></div><div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link to={`/communities/${community.slug}/manage`}>{t("Manage")}</Link></Button><Button size="sm" variant="ghost" className={community.status === "ACTIVE" ? "text-red-600" : "text-emerald-700"} onClick={() => { setTarget(community); setConfirmation(""); }}>{community.status === "ACTIVE" ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}{t(community.status === "ACTIVE" ? "Archive" : "Restore")}</Button></div></div>) : <Empty text={t("No communities found.")} />}</div></div>
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(undefined); }}><DialogContent><DialogHeader><DialogTitle>{t(target?.status === "ACTIVE" ? "Archive this community?" : "Restore this community?")}</DialogTitle><DialogDescription>{t(target?.status === "ACTIVE" ? "Archived communities become read-only and cannot accept new members." : "Restoring makes the community active again.")}</DialogDescription></DialogHeader><label className="space-y-2 text-sm"><span>{t("Type the community name to confirm")}: <strong>{target?.name}</strong></span><Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label><DialogFooter><Button variant="ghost" onClick={() => setTarget(undefined)}>{t("Cancel")}</Button><Button variant={target?.status === "ACTIVE" ? "destructive" : "default"} disabled={confirmation !== target?.name || update.isPending} onClick={changeStatus}>{t(target?.status === "ACTIVE" ? "Archive community" : "Restore community")}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

function DiscussionAdminList({ data, loading }: { data: ForumPostView[]; loading: boolean }) {
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
  return <><div className="overflow-hidden rounded-xl border bg-card"><div className="divide-y">{data.length ? data.map((post) => <div key={post.id} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(post.type)}</Badge>{post.isPinned ? <Badge variant="secondary">{t("Pinned")}</Badge> : null}{post.status === "locked" ? <Badge variant="secondary">{t("Locked")}</Badge> : null}{post.status === "hidden" ? <Badge variant="destructive">{t("Hidden")}</Badge> : null}</div><Link to={`/forum/${post.id}`} className="mt-2 block truncate font-semibold hover:text-blue-700">{post.title}</Link><p className="mt-1 text-xs text-muted-foreground">{post.author.fullName} · {post.commentCount} {t("responses")}</p></div><div className="flex flex-wrap gap-1">{post.status !== "hidden" ? <><Button size="sm" variant="ghost" disabled={moderate.isPending} onClick={() => moderate.mutate({ targetType: "post", targetId: post.id, action: post.isPinned ? "THREAD_UNPINNED" : "THREAD_PINNED" })}><Pin className="h-4 w-4" />{t(post.isPinned ? "Unpin" : "Pin")}</Button><Button size="sm" variant="ghost" disabled={moderate.isPending} onClick={() => moderate.mutate({ targetType: "post", targetId: post.id, action: post.status === "locked" ? "THREAD_UNLOCKED" : "THREAD_LOCKED" })}><Lock className="h-4 w-4" />{t(post.status === "locked" ? "Unlock" : "Lock")}</Button></> : null}<Button size="sm" variant="ghost" className={post.status === "hidden" ? "text-emerald-700" : "text-red-600"} onClick={() => setTarget(post)}>{t(post.status === "hidden" ? "Restore" : "Hide")}</Button></div></div>) : <Empty text={t("No discussions found.")} />}</div></div>
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(undefined); }}><DialogContent><DialogHeader><DialogTitle>{t(target?.status === "hidden" ? "Restore this discussion?" : "Hide this discussion?")}</DialogTitle><DialogDescription>{t(target?.status === "hidden" ? "The discussion will return to the community feed." : "It will leave the public feed and the action will be recorded in moderation history.")}</DialogDescription></DialogHeader><label className="space-y-2 text-sm"><span>{t("Moderation reason")}</span><textarea rows={4} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2" /></label><DialogFooter><Button variant="ghost" onClick={() => setTarget(undefined)}>{t("Cancel")}</Button><Button variant={target?.status === "hidden" ? "default" : "destructive"} disabled={reason.trim().length < 3 || moderate.isPending} onClick={hide}>{t(target?.status === "hidden" ? "Restore discussion" : "Hide discussion")}</Button></DialogFooter></DialogContent></Dialog></>;
}

function Loading() { return <div className="space-y-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>; }
function Empty({ text }: { text: string }) { return <div className="py-14 text-center text-sm text-muted-foreground">{text}</div>; }
