import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LockKeyhole, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/features/auth";
import { useCreateCommunity } from "@/features/forum";
import { isAdminSystemRole } from "@trend/shared-types";

function splitValues(value: string) {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

function requestError(error: unknown) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Could not create this community.";
}

export function CommunityNewPage() {
  const navigate = useNavigate();
  const create = useCreateCommunity();
  const { data: currentUser } = useCurrentUser();
  const user = currentUser?.user;
  const canCreate = Boolean(user && (
    isAdminSystemRole(user.systemRole) || user.capabilities?.includes("BASIC_RESEARCH")
  ));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [topics, setTopics] = useState("");
  const [rules, setRules] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const community = await create.mutateAsync({
        name: name.trim(), description: description.trim(), visibility,
        researchTopics: splitValues(topics), rules: splitValues(rules),
      });
      navigate(`/communities/${community.slug}`, { replace: true });
    } catch (reason) {
      setError(requestError(reason));
    }
  }

  if (!canCreate) {
    return <main className="mx-auto max-w-2xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Community creation is limited</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">Complete email verification and academic onboarding to create a community.</p><Button asChild variant="outline" className="mt-5"><Link to="/communities">Browse communities</Link></Button></main>;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link to="/communities" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-700 dark:text-slate-300"><ArrowLeft className="h-4 w-4" />All communities</Link>
      <header className="mt-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Community setup</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">Create an academic community</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Define a focused research scope and clear participation expectations. You will become the community owner.</p></header>

      <form onSubmit={submit} className="mt-7 space-y-6 border-t border-slate-200 pt-7 dark:border-slate-800">
        <Field label="Community name" hint="Use a recognizable research field or working group name."><Input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Empirical Software Engineering" /></Field>
        <Field label="Description" hint={`${description.length}/2000`}><textarea required maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-32 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700" placeholder="What questions, methods and collaborations belong here?" /></Field>
        <Field label="Research topics" hint="Separate topics with commas or new lines."><Input value={topics} onChange={(event) => setTopics(event.target.value)} placeholder="software testing, mining software repositories" /></Field>
        <Field label="Community rules" hint="One rule per line. You can edit these later."><textarea maxLength={3000} value={rules} onChange={(event) => setRules(event.target.value)} className="min-h-28 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700" placeholder={"Cite sources for factual claims\nKeep critique constructive\nDo not share confidential manuscripts"} /></Field>

        <fieldset><legend className="text-sm font-medium text-slate-800 dark:text-slate-200">Visibility</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["public", "private"] as const).map((value) => <label key={value} className={`cursor-pointer rounded-xl border p-4 transition-colors ${visibility === value ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/20" : "border-slate-200 hover:border-slate-300 dark:border-slate-700"}`}><input type="radio" name="visibility" value={value} checked={visibility === value} onChange={() => setVisibility(value)} className="sr-only" /><span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{value === "public" ? <Users className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}{value === "public" ? "Public community" : "Private community"}</span><span className="mt-1.5 block text-xs leading-5 text-slate-500">{value === "public" ? "Anyone can read discussions and members join immediately." : "Community metadata is discoverable, but discussions require approved membership."}</span></label>)}</div></fieldset>

        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-5 dark:border-slate-800"><Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button><Button type="submit" disabled={create.isPending || name.trim().length < 2 || !description.trim()}>{create.isPending ? "Creating…" : "Create community"}</Button></div>
      </form>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><div className="flex items-end justify-between gap-3"><Label>{label}</Label>{hint ? <span className="text-xs text-slate-500">{hint}</span> : null}</div>{children}</div>;
}
