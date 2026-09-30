import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LockKeyhole, Users } from "lucide-react";
import { isAdminSystemRole } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/features/auth";
import { canProposeCommunity, proposalBlockReason, useCreateCommunity } from "@/features/forum";
import { useI18n } from "@/i18n";

const splitValues = (value: string) => [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
type ApiError = { response?: { data?: { error?: { message?: string; details?: { existing?: { slug: string; name: string } } } } } };
const requestError = (error: unknown, fallback: string) => (error as ApiError)?.response?.data?.error?.message ?? fallback;
const existingCommunity = (error: unknown) => (error as ApiError)?.response?.data?.error?.details?.existing;

export function CommunityNewPage() {
  const { t } = useI18n(); const navigate = useNavigate(); const create = useCreateCommunity(); const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const isAdmin = Boolean(currentUser?.user && isAdminSystemRole(currentUser.user.systemRole));
  const canCreate = canProposeCommunity(currentUser?.user);
  const [name, setName] = useState(""); const [researchField, setResearchField] = useState(""); const [icon, setIcon] = useState("");
  const [description, setDescription] = useState(""); const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [topics, setTopics] = useState(""); const [rules, setRules] = useState(""); const [error, setError] = useState(""); const [existing, setExisting] = useState<{ slug: string; name: string }>();

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setExisting(undefined);
    try {
      const community = await create.mutateAsync({ name: name.trim(), researchField: researchField.trim() || undefined, icon: icon.trim() || undefined, description: description.trim(), visibility, researchTopics: splitValues(topics), rules: splitValues(rules) });
      navigate(`/communities/${community.slug}`, { replace: true });
    } catch (reason) { setError(requestError(reason, t("Could not create this community."))); setExisting(existingCommunity(reason)); }
  }

  if (userLoading) return <main className="mx-auto max-w-3xl px-4 py-8"><div className="h-72 animate-pulse rounded-xl bg-muted" /></main>;
  if (!canCreate) {
    const reason = proposalBlockReason(currentUser?.user);
    return <main className="mx-auto max-w-2xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold">{t("Community creation is limited")}</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{t(reason === "UNVERIFIED" ? "Your academic role is not verified yet. Verify it in your academic profile to propose a research community." : "Only administrators and verified lecturers or researchers can propose research communities. You can browse and join existing communities.")}</p>
      <div className="mt-5 flex justify-center gap-2">{reason === "UNVERIFIED" ? <Button asChild><Link to="/settings/profile">{t("Verify academic role")}</Link></Button> : null}<Button asChild variant="outline"><Link to="/communities">{t("Browse communities")}</Link></Button></div></main>;
  }

  return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6"><Link to="/communities" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-blue-700"><ArrowLeft className="h-4 w-4" />{t("All communities")}</Link>
    <header className="mt-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{t("Community setup")}</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{t("Create a research community")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("Define a focused research field, discussion scope, and concise participation rules.")}</p>{!isAdmin ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("Your community will be reviewed by an administrator before it becomes visible to others.")}</p> : null}</header>
    <form onSubmit={submit} className="mt-7 space-y-6 border-t pt-7"><Field label={t("Community name")} hint={t("Use a recognizable research field name.")}><Input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Software Engineering")} /></Field>
      <div className="grid gap-5 sm:grid-cols-[1fr_180px]"><Field label={t("Research field")}><Input minLength={2} maxLength={160} value={researchField} onChange={(event) => setResearchField(event.target.value)} placeholder={t("Computer Science")} /></Field><Field label={t("Icon key")} hint={t("Optional")}><Input maxLength={40} pattern="[A-Za-z0-9-]+" value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="code-2" /></Field></div>
      <Field label={t("Description")} hint={`${description.length}/2000`}><textarea required maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder={t("What questions, methods, and evidence belong here?")} /></Field>
      <Field label={t("Research topics")} hint={t("Separate topics with commas or new lines.")}><Input value={topics} onChange={(event) => setTopics(event.target.value)} placeholder={t("software testing, code review, empirical study")} /></Field>
      <Field label={t("Community rules")} hint={t("One rule per line. You can edit these later.")}><textarea maxLength={3000} value={rules} onChange={(event) => setRules(event.target.value)} className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder={t("Cite sources for factual claims\nKeep critique constructive\nDo not share confidential manuscripts")} /></Field>
      <fieldset><legend className="text-sm font-medium">{t("Visibility")}</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["public", "private"] as const).map((value) => <label key={value} className={`cursor-pointer rounded-xl border p-4 transition-colors ${visibility === value ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/20" : "hover:border-slate-400"}`}><input type="radio" name="visibility" value={value} checked={visibility === value} onChange={() => setVisibility(value)} className="sr-only" /><span className="flex items-center gap-2 text-sm font-semibold">{value === "public" ? <Users className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}{t(value === "public" ? "Public community" : "Private community")}</span><span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{t(value === "public" ? "Anyone can read discussions and members join immediately." : "Community metadata is discoverable, but discussions require approved membership.")}</span></label>)}</div></fieldset>
      {error ? <p role="alert" className="text-sm text-red-600">{error}{existing ? <> {" "}<Link to={`/communities/${existing.slug}`} className="font-medium underline">{t("Open")} {existing.name}</Link></> : null}</p> : null}<div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="ghost" onClick={() => navigate(-1)}>{t("Cancel")}</Button><Button type="submit" disabled={create.isPending || name.trim().length < 2 || !description.trim()}>{t(create.isPending ? "Creating…" : "Create community")}</Button></div>
    </form>
  </main>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <div className="space-y-2"><div className="flex items-end justify-between gap-3"><Label>{label}</Label>{hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}</div>{children}</div>; }
