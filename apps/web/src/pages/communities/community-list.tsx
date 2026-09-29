import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, LockKeyhole, MessageSquare, Plus, Search, Users } from "lucide-react";
import { isAdminSystemRole } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/features/auth";
import { useCommunities } from "@/features/forum";
import { useI18n } from "@/i18n";

type Scope = "all" | "mine";

export function CommunityListPage() {
  const { t } = useI18n();
  const { data, isLoading, error } = useCommunities();
  const { data: currentUser } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const user = currentUser?.user;
  const canCreate = Boolean(user && isAdminSystemRole(user.systemRole));

  const communities = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (data ?? []).filter((community) => {
      if (scope === "mine" && community.viewerMembership?.status !== "active") return false;
      if (!needle) return true;
      return community.name.toLocaleLowerCase().includes(needle)
        || community.description.toLocaleLowerCase().includes(needle)
        || community.researchField?.toLocaleLowerCase().includes(needle)
        || community.researchTopics.some((topic) => topic.toLocaleLowerCase().includes(needle));
    });
  }, [data, query, scope]);

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{t("Research fields")}</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{t("Research Communities")}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("Join focused spaces for questions, evidence and academic discussion in your research field.")}</p></div>
      {canCreate ? <Button asChild className="gap-2 self-start sm:self-auto"><Link to="/communities/new"><Plus className="h-4 w-4" />{t("Create community")}</Link></Button> : null}
    </header>

    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex w-fit rounded-lg bg-muted p-1" aria-label={t("Community scope")}>
        {(["all", "mine"] as const).map((value) => <button key={value} type="button" onClick={() => setScope(value)} disabled={value === "mine" && !user} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${scope === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{t(value === "all" ? "All communities" : "My communities")}</button>)}
      </div>
      <label className="relative w-full sm:max-w-sm"><span className="sr-only">{t("Search communities")}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search by name, field, or research topic")} className="pl-9" /></label>
    </div>

    {isLoading ? <div className="mt-7 divide-y overflow-hidden rounded-xl border bg-card">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-36 animate-pulse bg-muted/40" />)}</div>
      : error ? <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{t("Unable to load communities. Please try again.")}</div>
        : communities.length ? <div className="mt-7 divide-y overflow-hidden rounded-xl border bg-card">{communities.map((community) => <Link key={community.id} to={`/communities/${community.slug}`} className="group grid gap-4 p-5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold group-hover:text-blue-700">{community.name}</h2>{community.visibility === "private" ? <Badge variant="outline" className="gap-1 font-normal"><LockKeyhole className="h-3 w-3" />{t("Private")}</Badge> : null}{community.viewerMembership?.status === "active" ? <Badge className="gap-1 border-emerald-200 bg-emerald-50 font-normal text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" />{t("Joined")}</Badge> : null}</div>
            {community.researchField ? <p className="mt-1 text-xs font-medium text-blue-700">{community.researchField}</p> : null}<p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground">{community.description || t("A focused space for researchers working in this field.")}</p>{community.researchTopics.length ? <div className="mt-3 flex flex-wrap gap-1.5">{community.researchTopics.slice(0, 5).map((topic) => <Badge key={topic} variant="secondary" className="font-normal">{topic}</Badge>)}</div> : null}
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground sm:justify-end"><span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /><span className="tabular-nums">{community.memberCount}</span><span>{t(community.memberCount === 1 ? "member" : "members")}</span></span><span className="inline-flex items-center gap-1.5"><MessageSquare className="h-4 w-4" /><span className="tabular-nums">{community.threadCount}</span><span>{t(community.threadCount === 1 ? "discussion" : "discussions")}</span></span></div>
        </Link>)}</div>
          : <div className="mt-7 rounded-xl border border-dashed px-6 py-14 text-center"><h2 className="font-semibold">{t(scope === "mine" ? "You haven't joined any research communities yet." : "No communities found")}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t(query ? "Try a broader name or research topic." : "New research communities will appear here.")}</p>{query ? <Button type="button" variant="outline" className="mt-4" onClick={() => setQuery("")}>{t("Clear search")}</Button> : null}</div>}
  </main>;
}
