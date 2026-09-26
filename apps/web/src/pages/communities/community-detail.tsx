import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock3, LockKeyhole, Settings2, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCommunity, useForumPosts, useJoinCommunity, useLeaveCommunity } from "@/features/forum";
import { useAuthStore } from "@/stores/auth-store";

function requestError(error: unknown, fallback: string) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

export function CommunityDetailPage() {
  const { slug = "" } = useParams();
  const location = useLocation();
  const { data: community, isLoading, error } = useCommunity(slug);
  const join = useJoinCommunity();
  const leave = useLeaveCommunity();
  const isAuthed = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const posts = useForumPosts({ page: 1, pageSize: 20, communityId: community?.id }, Boolean(community?.id && !community.contentRestricted));
  const membership = community?.viewerMembership;
  const membershipBusy = join.isPending || leave.isPending;
  const mutationError = join.error ? requestError(join.error, "Could not join this community.") : leave.error ? requestError(leave.error, "Could not leave this community.") : "";

  if (isLoading) return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><div className="h-52 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" /><div className="mt-6 h-72 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" /></main>;
  if (error || !community) return <main className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Community unavailable</h1><p className="mt-2 text-sm text-slate-500">This community may not exist or may no longer be available.</p><Button asChild variant="outline" className="mt-5"><Link to="/communities">Browse communities</Link></Button></main>;

  const joinLabel = community.visibility === "private" ? "Request to join" : "Join community";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link to="/communities" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-700 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-300"><ArrowLeft className="h-4 w-4" />All communities</Link>

      <header className="mt-5 border-b border-slate-200 pb-7 dark:border-slate-800">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 font-normal">{community.visibility === "private" ? <LockKeyhole className="h-3 w-3" /> : null}{community.visibility === "private" ? "Private" : "Public"}</Badge>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" />{community.memberCount} {community.memberCount === 1 ? "member" : "members"}</span>
              {membership?.status === "active" ? <Badge className="gap-1 border-emerald-200 bg-emerald-50 font-normal text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" />{membership.role}</Badge> : null}
              {membership?.status === "pending" ? <Badge variant="outline" className="gap-1 font-normal text-amber-700 dark:text-amber-300"><Clock3 className="h-3 w-3" />Request pending</Badge> : null}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">{community.name}</h1>
            <p className="mt-3 max-w-[70ch] text-sm leading-7 text-slate-600 dark:text-slate-300">{community.description || "A focused academic community for exchanging evidence, questions and research practice."}</p>
            {community.researchTopics.length > 0 ? <div className="mt-4 flex flex-wrap gap-2">{community.researchTopics.map((topic) => <Badge key={topic} variant="secondary" className="font-normal">{topic}</Badge>)}</div> : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {community.canManage ? <Button asChild variant="outline" className="gap-2"><Link to={`/communities/${community.slug}/manage`}><Settings2 className="h-4 w-4" />Manage</Link></Button> : null}
            {!isAuthed ? <Button asChild><Link to="/login" state={{ from: location }}>Sign in to join</Link></Button>
              : !membership || membership.status === "declined" ? <Button disabled={membershipBusy} onClick={() => join.mutate(community.id)}>{membershipBusy ? "Working…" : joinLabel}</Button>
                : membership.status === "pending" ? <Button variant="outline" disabled={membershipBusy} onClick={() => leave.mutate(community.id)}>{membershipBusy ? "Working…" : "Cancel request"}</Button>
                  : membership.status === "active" && membership.role !== "owner" ? <Button variant="outline" disabled={membershipBusy} onClick={() => leave.mutate(community.id)}>{membershipBusy ? "Working…" : "Leave community"}</Button>
                    : membership.status === "banned" ? <Button disabled variant="outline">Access unavailable</Button> : null}
          </div>
        </div>
        {mutationError ? <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-300">{mutationError}</p> : null}
      </header>

      <div className="mt-7 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Recent discussions</h2><p className="mt-1 text-sm text-slate-500">Questions and evidence shared by this community.</p></div>
            {membership?.status === "active" ? <Button size="sm" asChild><Link to={`/forum/new?community=${community.id}`}>New post</Link></Button> : null}
          </div>

          {community.contentRestricted ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700"><LockKeyhole className="mx-auto h-6 w-6 text-slate-400" /><h3 className="mt-3 font-semibold text-slate-900 dark:text-slate-100">Discussions are private</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Request membership to read and contribute to this community.</p></div>
          ) : posts.isLoading ? (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-28 animate-pulse bg-slate-50 dark:bg-slate-900/40" />)}</div>
          ) : posts.error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">Unable to load community discussions.</div>
          ) : posts.data?.data.length ? (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#101923]">{posts.data.data.map((post) => <Link key={post.id} to={`/forum/${post.id}`} className="block p-5 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-500 dark:hover:bg-slate-900/60"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary" className="font-normal capitalize">{post.type}</Badge><span className="text-xs text-slate-500">{post.commentCount} {post.commentCount === 1 ? "response" : "responses"}</span></div><h3 className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{post.title}</h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{post.content}</p></Link>)}</div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700"><h3 className="font-semibold text-slate-900 dark:text-slate-100">No discussions yet</h3><p className="mt-2 text-sm text-slate-500">{membership?.status === "active" ? "Start the first focused academic discussion." : "Join the community to start a discussion."}</p></div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#101923]"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Community rules</h2></div>{community.rules.length > 0 ? <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{community.rules.map((rule, index) => <li key={`${rule}-${index}`} className="flex gap-3"><span className="font-medium tabular-nums text-slate-400">{index + 1}.</span><span>{rule}</span></li>)}</ol> : <p className="mt-3 text-sm leading-6 text-slate-500">Follow respectful academic discussion and cite evidence where possible.</p>}</section>
          {community.visibility === "private" ? <section className="rounded-xl bg-slate-100 p-5 text-sm leading-6 text-slate-600 dark:bg-slate-900 dark:text-slate-300"><strong className="font-semibold text-slate-900 dark:text-slate-100">Private community</strong><p className="mt-1">Membership requests must be approved before discussions become visible.</p></section> : null}
        </aside>
      </div>
    </main>
  );
}
