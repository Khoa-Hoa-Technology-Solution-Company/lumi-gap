import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Shield, UserRoundCog, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/features/auth";
import { type CommunityView, useCommunity, useCommunityMembers, useUpdateCommunity, useUpdateCommunityMember } from "@/features/forum";

function splitValues(value: string) {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

function requestError(error: unknown, fallback: string) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

export function CommunityManagePage() {
  const { slug = "" } = useParams();
  const { data: community, isLoading, error } = useCommunity(slug);

  if (isLoading) return <main className="mx-auto max-w-5xl px-4 py-8"><div className="h-80 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" /></main>;
  if (error || !community) return <ManageUnavailable message="Community unavailable." />;
  if (!community.canManage) return <ManageUnavailable message="You do not have permission to manage this community." community={community} />;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link to={`/communities/${community.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-700 dark:text-slate-300"><ArrowLeft className="h-4 w-4" />Back to community</Link>
      <header className="mt-5 border-b border-slate-200 pb-6 dark:border-slate-800"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Community management</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">{community.name}</h1><p className="mt-2 text-sm text-slate-500">Update the community scope, rules and membership.</p></header>
      <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <CommunitySettingsForm community={community} />
        <MemberManagement community={community} />
      </div>
    </main>
  );
}

function ManageUnavailable({ message, community }: { message: string; community?: CommunityView }) {
  return <main className="mx-auto max-w-2xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Management unavailable</h1><p className="mt-2 text-sm text-slate-500">{message}</p><Button asChild variant="outline" className="mt-5"><Link to={community ? `/communities/${community.slug}` : "/communities"}>Go back</Link></Button></main>;
}

function CommunitySettingsForm({ community }: { community: CommunityView }) {
  const update = useUpdateCommunity();
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [visibility, setVisibility] = useState(community.visibility);
  const [topics, setTopics] = useState(community.researchTopics.join(", "));
  const [rules, setRules] = useState(community.rules.join("\n"));
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await update.mutateAsync({ id: community.id, input: { name: name.trim(), description: description.trim(), visibility, researchTopics: splitValues(topics), rules: splitValues(rules) } });
      setMessage({ text: "Community settings saved." });
    } catch (error) {
      setMessage({ text: requestError(error, "Could not save community settings."), error: true });
    }
  }

  return <section><div className="flex items-center gap-2"><Shield className="h-4 w-4 text-blue-600" /><h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Settings and rules</h2></div><form onSubmit={submit} className="mt-5 space-y-5">
    <Field label="Community name"><Input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
    <Field label="Description"><textarea required maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-32 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700" /></Field>
    <Field label="Research topics" hint="Comma separated"><Input value={topics} onChange={(event) => setTopics(event.target.value)} /></Field>
    <Field label="Community rules" hint="One rule per line"><textarea value={rules} onChange={(event) => setRules(event.target.value)} className="min-h-32 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700" /></Field>
    <Field label="Visibility"><select value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "private")} className="h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"><option value="public">Public, anyone can read</option><option value="private">Private, approved members only</option></select></Field>
    {message ? <p role="status" className={`text-sm ${message.error ? "text-red-600 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>{message.text}</p> : null}
    <Button type="submit" disabled={update.isPending || name.trim().length < 2 || !description.trim()}>{update.isPending ? "Saving…" : "Save settings"}</Button>
  </form></section>;
}

function MemberManagement({ community }: { community: CommunityView }) {
  const { data: currentUser } = useCurrentUser();
  const members = useCommunityMembers(community.id, community.canManage);
  const updateMember = useUpdateCommunityMember();
  const [error, setError] = useState("");
  const canAssignModerators = currentUser?.user.role === "admin" || community.viewerMembership?.role === "owner";

  async function change(userId: string, input: { role?: "moderator" | "member"; status?: "pending" | "active" | "declined" | "banned" }) {
    setError("");
    try {
      await updateMember.mutateAsync({ id: community.id, userId, input });
    } catch (reason) {
      setError(requestError(reason, "Could not update this member."));
    }
  }

  return <section><div className="flex items-center gap-2"><UserRoundCog className="h-4 w-4 text-blue-600" /><h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Members</h2></div><p className="mt-1 text-sm text-slate-500">Approve requests and keep community access current.</p>
    {error ? <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
    {members.isLoading ? <div className="mt-5 space-y-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />)}</div>
      : members.error ? <p className="mt-5 text-sm text-red-600">Unable to load members.</p>
        : <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">{members.data?.map((member) => <div key={member.id} className="py-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{member.user.avatarUrl ? <img src={member.user.avatarUrl} alt="" className="h-full w-full object-cover" /> : member.user.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{member.user.fullName}</p><Badge variant="outline" className="font-normal capitalize">{member.role}</Badge><Badge variant="secondary" className="font-normal capitalize">{member.status}</Badge></div><p className="mt-0.5 truncate text-xs text-slate-500">{member.user.email}{member.user.institution ? ` · ${member.user.institution}` : ""}</p></div></div>{member.role !== "owner" ? <div className="mt-3 flex flex-wrap gap-2 pl-12">{member.status === "pending" ? <><Button size="sm" variant="outline" className="gap-1.5" disabled={updateMember.isPending} onClick={() => change(member.user.id, { status: "active" })}><Check className="h-3.5 w-3.5" />Approve</Button><Button size="sm" variant="ghost" className="gap-1.5 text-red-600" disabled={updateMember.isPending} onClick={() => change(member.user.id, { status: "declined" })}><X className="h-3.5 w-3.5" />Decline</Button></> : ["banned", "declined"].includes(member.status) ? <Button size="sm" variant="outline" disabled={updateMember.isPending} onClick={() => change(member.user.id, { status: "active" })}>Restore access</Button> : <Button size="sm" variant="ghost" className="text-red-600" disabled={updateMember.isPending} onClick={() => change(member.user.id, { status: "banned" })}>Ban member</Button>}{canAssignModerators && member.status === "active" ? <Button size="sm" variant="outline" disabled={updateMember.isPending} onClick={() => change(member.user.id, { role: member.role === "moderator" ? "member" : "moderator" })}>{member.role === "moderator" ? "Remove moderator" : "Make moderator"}</Button> : null}</div> : null}</div>)}</div>}
  </section>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><div className="flex items-end justify-between gap-3"><Label>{label}</Label>{hint ? <span className="text-xs text-slate-500">{hint}</span> : null}</div>{children}</div>;
}
