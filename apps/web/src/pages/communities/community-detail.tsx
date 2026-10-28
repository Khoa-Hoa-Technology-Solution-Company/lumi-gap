import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, LockKeyhole, Settings2, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCommunity, useJoinCommunity, useLeaveCommunity } from "@/features/forum";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import { CommunityMembersTab } from "./community-members-tab";
import { CommunityRelatedCard } from "./community-related-card";
import { CommunityReviewBanner } from "./community-review-banner";

type Tab = "members" | "about";
const TABS: Array<{ value: Tab; label: string }> = [{ value: "members", label: "Members" }, { value: "about", label: "About" }];

function requestError(error: unknown, fallback: string) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

export function CommunityDetailPage() {
  const { t } = useI18n(); const { slug = "" } = useParams(); const location = useLocation();
  const { data: community, isLoading, error } = useCommunity(slug); const join = useJoinCommunity(); const leave = useLeaveCommunity();
  const isAuthed = useAuthStore((state) => Boolean(state.tokens?.accessToken)); const [tab, setTab] = useState<Tab>("about");
  const membership = community?.viewerMembership; const busy = join.isPending || leave.isPending;
  const mutationError = join.error ? requestError(join.error, t("Could not join this community.")) : leave.error ? requestError(leave.error, t("Could not leave this community.")) : "";

  if (isLoading) return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><div className="h-52 animate-pulse rounded-xl bg-muted" /><div className="mt-6 h-72 animate-pulse rounded-xl bg-muted" /></main>;
  if (error || !community) return <main className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold">{t("Community unavailable")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("This community may not exist or may no longer be available.")}</p><Button asChild variant="outline" className="mt-5"><Link to="/communities">{t("Browse communities")}</Link></Button></main>;

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <Link to="/communities" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-blue-700"><ArrowLeft className="h-4 w-4" />{t("All communities")}</Link>
    <header className="mt-5 border-b pb-6"><div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 max-w-3xl"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="gap-1 font-normal">{community.visibility === "private" ? <LockKeyhole className="h-3 w-3" /> : null}{t(community.visibility === "private" ? "Private" : "Public")}</Badge>{community.researchField ? <span className="text-xs font-medium text-blue-700">{community.researchField}</span> : null}</div><h1 className="lumi-page-title mt-3">{community.name}</h1><p className="mt-3 max-w-[72ch] text-sm leading-7 text-muted-foreground">{community.description || t("A focused academic community for exchanging evidence, questions and research practice.")}</p><div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />{community.memberCount} {t(community.memberCount === 1 ? "member" : "members")}</span></div></div>
      <div className="flex shrink-0 flex-wrap gap-2">{community.canManage ? <Button asChild variant="outline" className="gap-2"><Link to={`/communities/${community.slug}/manage`}><Settings2 className="h-4 w-4" />{t("Manage")}{community.pendingRequestCount ? <span className="rounded-full bg-blue-700 px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums">{community.pendingRequestCount}</span> : null}</Link></Button> : null}{!isAuthed ? <Button variant="discussion" asChild><Link to="/login" state={{ from: location }}>{t("Sign in to join")}</Link></Button> : membership?.status === "active" ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={busy}><Check className="h-4 w-4" />{t("Joined")}<ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="text-red-600" onSelect={() => leave.mutate(community.id)}>{t("Leave community")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : membership?.status === "pending" ? <Button variant="outline" disabled={busy} onClick={() => leave.mutate(community.id)}>{t(busy ? "Working…" : "Cancel request")}</Button> : membership?.status === "banned" ? <Button disabled variant="outline">{t("Access unavailable")}</Button> : <Button variant="discussion" disabled={busy || community.status !== "ACTIVE"} onClick={() => join.mutate(community.id)}>{t(busy ? "Joining…" : community.visibility === "private" ? "Request to join" : "Join Community")}</Button>}</div>
    </div>{community.status === "PENDING_APPROVAL" || community.status === "REJECTED" ? <CommunityReviewBanner community={community} /> : null}{mutationError ? <p role="alert" className="mt-4 text-sm text-red-600">{mutationError}</p> : null}</header>

    <nav className="mt-5 flex gap-1 overflow-x-auto border-b" aria-label={t("Community views")}>{TABS.map((item) => <button key={item.value} type="button" onClick={() => setTab(item.value)} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === item.value ? "border-blue-700 text-blue-700" : "border-transparent text-muted-foreground hover:text-foreground")}>{t(item.label)}</button>)}</nav>
    <div className="mt-6 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_280px]"><section>{tab === "members" ? <CommunityMembersTab community={community} /> : <AboutCommunity community={community} t={t} />}</section>
      <aside className="space-y-5">{!community.contentRestricted && community.status === "ACTIVE" ? <CommunityRelatedCard community={community} /> : null}{community.contentRestricted ? null : <section className="rounded-xl border bg-card p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">{t("Community rules")}</h2></div>{community.rules.length ? <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">{community.rules.map((rule, index) => <li key={`${rule}-${index}`} className="flex gap-3"><span className="font-medium tabular-nums text-muted-foreground">{index + 1}.</span><span>{rule}</span></li>)}</ol> : <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("Follow respectful academic discussion and cite evidence where possible.")}</p>}</section>}
        {!community.contentRestricted && community.moderators?.length ? <section className="rounded-xl border bg-card p-5"><h2 className="text-sm font-semibold">{t("Moderators")}</h2><div className="mt-3 space-y-3">{community.moderators.map((moderator) => <div key={moderator.id} className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">{moderator.avatarUrl ? <img src={moderator.avatarUrl} alt="" className="h-full w-full object-cover" /> : moderator.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div><span className="text-sm">{moderator.fullName}</span></div>)}</div></section> : null}
      </aside></div>
  </main>;
}

function AboutCommunity({ community, t }: { community: NonNullable<ReturnType<typeof useCommunity>["data"]>; t: (key: string) => string }) { return <div className="rounded-xl border bg-card p-6"><h2 className="text-lg font-semibold">{t("About this community")}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{community.description}</p>{community.contentRestricted ? <div className="mt-6"><PrivateNotice t={t} /></div> : community.researchTopics.length ? <><h3 className="mt-6 text-sm font-semibold">{t("Research topics")}</h3><div className="mt-3 flex flex-wrap gap-2">{community.researchTopics.map((topic) => <Badge key={topic} variant="secondary" className="font-normal">{topic}</Badge>)}</div></> : null}</div>; }
function PrivateNotice({ t }: { t: (key: string) => string }) { return <Empty icon={LockKeyhole} title={t("This community is private")} detail={t("Request membership to see its members and related research.")} />; }
function Empty({ icon: Icon, title, detail }: { icon: typeof LockKeyhole; title: string; detail: string }) { return <div className="rounded-xl border border-dashed px-6 py-12 text-center"><Icon className="mx-auto h-6 w-6 text-muted-foreground" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{detail}</p></div>; }
