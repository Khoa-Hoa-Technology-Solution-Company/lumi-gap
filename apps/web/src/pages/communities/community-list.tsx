import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCommunities } from "@/features/forum";

export function CommunityListPage() {
  const { data, isLoading } = useCommunities();
  return <div className="mx-auto max-w-6xl space-y-6"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Research fields</p><h1 className="mt-2 text-3xl font-bold">Academic Communities</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Join focused spaces for questions and discussions in your area of research.</p></header>{isLoading ? <p className="text-sm text-slate-500">Loading communities…</p> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{data?.map((community) => <Link key={community.id} to={`/communities/${community.slug}`} className="rounded-xl border bg-white p-5 transition hover:border-blue-300 hover:shadow-sm dark:bg-zinc-950"><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{community.name}</h2><Badge variant="outline">{community.visibility}</Badge></div><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{community.description}</p><div className="mt-4 flex flex-wrap gap-2">{community.researchTopics.slice(0, 4).map((topic) => <Badge key={topic} variant="secondary">{topic}</Badge>)}</div><div className="mt-5 flex items-center gap-2 text-xs text-slate-500"><Users className="h-4 w-4" />{community.memberCount} members</div></Link>)}</div>}</div>;
}
