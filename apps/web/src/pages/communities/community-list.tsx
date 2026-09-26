import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, LockKeyhole, Plus, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/features/auth";
import { useCommunities } from "@/features/forum";
import { isAdminSystemRole } from "@trend/shared-types";

type Scope = "all" | "mine";

export function CommunityListPage() {
  const { data, isLoading, error } = useCommunities();
  const { data: currentUser } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const user = currentUser?.user;
  const canCreate = Boolean(user && (
    isAdminSystemRole(user.systemRole) || user.capabilities?.includes("BASIC_RESEARCH")
  ));

  const communities = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (data ?? []).filter((community) => {
      if (scope === "mine" && !["active", "pending"].includes(community.viewerMembership?.status ?? "")) return false;
      if (!needle) return true;
      return community.name.toLocaleLowerCase().includes(needle)
        || community.description.toLocaleLowerCase().includes(needle)
        || community.researchTopics.some((topic) => topic.toLocaleLowerCase().includes(needle));
    });
  }, [data, query, scope]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Research fields</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">Academic Communities</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">Join focused spaces for questions, evidence and collaboration in your research area.</p>
        </div>
        {canCreate ? <Button asChild className="gap-2 self-start sm:self-auto"><Link to="/communities/new"><Plus className="h-4 w-4" />Create community</Link></Button> : null}
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-lg bg-slate-100 p-1 dark:bg-slate-900" aria-label="Community scope">
          {(["all", "mine"] as const).map((value) => <button key={value} type="button" onClick={() => setScope(value)} disabled={value === "mine" && !user} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40 ${scope === value ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-slate-50" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>{value === "all" ? "All communities" : "My communities"}</button>)}
        </div>
        <label className="relative w-full sm:max-w-sm"><span className="sr-only">Search communities</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or research topic" className="pl-9" /></label>
      </div>

      {isLoading ? (
        <div className="mt-7 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#101923]">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-36 animate-pulse bg-slate-50/60 dark:bg-slate-900/40" />)}</div>
      ) : error ? (
        <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">Unable to load communities. Please try again.</div>
      ) : communities.length > 0 ? (
        <div className="mt-7 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#101923]">
          {communities.map((community) => {
            const membership = community.viewerMembership;
            return <Link key={community.id} to={`/communities/${community.slug}`} className="group grid gap-4 p-5 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-500 dark:hover:bg-slate-900/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-950 group-hover:text-blue-700 dark:text-slate-50 dark:group-hover:text-blue-300">{community.name}</h2>
                  {community.visibility === "private" ? <Badge variant="outline" className="gap-1 font-normal"><LockKeyhole className="h-3 w-3" />Private</Badge> : null}
                  {membership?.status === "active" ? <Badge className="gap-1 border-emerald-200 bg-emerald-50 font-normal text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" />Joined</Badge> : null}
                  {membership?.status === "pending" ? <Badge variant="outline" className="gap-1 font-normal text-amber-700 dark:text-amber-300"><Clock3 className="h-3 w-3" />Request pending</Badge> : null}
                </div>
                <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">{community.description || "A focused space for researchers working in this field."}</p>
                {community.researchTopics.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{community.researchTopics.slice(0, 5).map((topic) => <Badge key={topic} variant="secondary" className="font-normal">{topic}</Badge>)}</div> : null}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500 sm:justify-end"><Users className="h-4 w-4" /><span className="tabular-nums">{community.memberCount}</span><span>{community.memberCount === 1 ? "member" : "members"}</span></div>
            </Link>;
          })}
        </div>
      ) : (
        <div className="mt-7 rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{scope === "mine" ? "You have not joined a community yet" : "No communities found"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{query ? "Try a broader name or research topic." : canCreate ? "Create the first focused space for your research field." : "New research communities will appear here."}</p>
          {query ? <Button type="button" variant="outline" className="mt-4" onClick={() => setQuery("")}>Clear search</Button> : canCreate ? <Button asChild className="mt-4"><Link to="/communities/new">Create community</Link></Button> : null}
        </div>
      )}
    </main>
  );
}
