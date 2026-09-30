import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ForumPostType } from "@trend/shared-types";
import { ArrowLeft, Bold, BookOpen, Eye, Italic, Link2, List, Quote, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCommunities, useCreateForumPost, useForumContext, useShareForumGap, type ForumReferenceView } from "@/features/forum";
import { useI18n } from "@/i18n";

const THREAD_TYPES: Array<{ value: ForumPostType; label: string; detail: string }> = [
  { value: "QUESTION", label: "Question", detail: "Ask for focused, evidence-backed responses." },
  { value: "DISCUSSION", label: "Discussion", detail: "Open an academic topic without expecting one accepted response." },
  { value: "PAPER_DISCUSSION", label: "Paper Discussion", detail: "Center the discussion on a LumiGap paper." },
  { value: "RESEARCH_GAP_DISCUSSION", label: "Research Gap Discussion", detail: "Discuss a shareable candidate research gap." },
];

export function ForumNewPage() {
  const { t } = useI18n(); const navigate = useNavigate(); const [searchParams] = useSearchParams(); const create = useCreateForumPost(); const shareGap = useShareForumGap();
  const { data: communities } = useCommunities(); const { data: context } = useForumContext();
  const joined = useMemo(() => (communities ?? []).filter((community) => community.status === "ACTIVE" && community.viewerMembership?.status === "active"), [communities]);
  const [type, setType] = useState<ForumPostType>(searchParams.get("gap") ? "RESEARCH_GAP_DISCUSSION" : "QUESTION"); const [communityId, setCommunityId] = useState("");
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [tags, setTags] = useState("");
  const requestedGapId = searchParams.get("gap") ?? ""; const [linkedPaperId, setLinkedPaperId] = useState(""); const [linkedGapId, setLinkedGapId] = useState(requestedGapId); const [linkedProjectId, setLinkedProjectId] = useState("");
  const [doi, setDoi] = useState(""); const [citationTitle, setCitationTitle] = useState(""); const [citationYear, setCitationYear] = useState("");
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const requestedCommunity = searchParams.get("community");
    if (!communityId && requestedCommunity && joined.some((community) => community.id === requestedCommunity)) setCommunityId(requestedCommunity);
  }, [communityId, joined, searchParams]);
  // A gap opened from a community page may not be among the user's own; the server re-checks that it is shareable.
  const gapOptions = useMemo(() => {
    const own = context?.gaps ?? [];
    if (!requestedGapId || own.some((gap) => gap.id === requestedGapId)) return own;
    return [{ id: requestedGapId, title: searchParams.get("gapTitle") ?? requestedGapId, topic: "", forumShareable: true }, ...own];
  }, [context?.gaps, requestedGapId, searchParams]);
  const selectedGap = gapOptions.find((gap) => gap.id === linkedGapId);
  const references: ForumReferenceView[] = doi.trim() && citationTitle.trim() ? [{ doi: doi.trim(), title: citationTitle.trim(), year: citationYear ? Number(citationYear) : undefined }] : [];

  function insert(prefix: string, suffix = prefix) {
    setContent((current) => `${current}${current ? "\n" : ""}${prefix}${suffix === prefix ? "" : suffix}`);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!communityId) return toast.error(t("Join a community before starting a discussion."));
    if (type === "PAPER_DISCUSSION" && !linkedPaperId) return toast.error(t("Select a paper for this paper discussion."));
    if (type === "RESEARCH_GAP_DISCUSSION" && (!linkedGapId || !selectedGap?.forumShareable)) return toast.error(t("Select a shareable candidate research gap."));
    try {
      const post = await create.mutateAsync({ type, communityId, title, content, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), linkedPaperId: linkedPaperId || undefined, linkedResearchGapId: linkedGapId || undefined, linkedProjectId: linkedProjectId || undefined, references });
      toast.success(t("Discussion published")); navigate(`/forum/${post.id}`);
    } catch { toast.error(t("Could not publish this discussion. Check the required research context and try again.")); }
  }

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <Link to="/forum" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t("Back to Forum")}</Link>
    <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={submit} className="min-w-0 space-y-6">
        <header><h1 className="text-2xl font-semibold tracking-tight">{t("New discussion")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Start a focused academic conversation and attach research context when it helps readers evaluate the claim.")}</p></header>
        <div className="grid gap-4 sm:grid-cols-2"><Field label={t("Community *")}><select required value={communityId} onChange={(event) => setCommunityId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">{t("Select a joined community")}</option>{joined.map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}</select></Field><Field label={t("Thread type *")}><select value={type} onChange={(event) => setType(event.target.value as ForumPostType)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{THREAD_TYPES.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select></Field></div>
        {!joined.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{t("You need to join a research community before posting.")} <Link to="/communities" className="font-semibold underline">{t("Explore communities")}</Link></div> : null}
        <p className="text-xs text-muted-foreground">{t(THREAD_TYPES.find((option) => option.value === type)?.detail ?? "")}</p>
        <Field label={t("Title *")}><Input required minLength={3} maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("State the research question or discussion focus clearly")} /></Field>
        <Field label={t("Body *")}>
          <div className="overflow-hidden rounded-lg border bg-background"><div className="flex flex-wrap gap-1 border-b bg-muted/30 p-2"><Tool icon={Bold} label={t("Bold")} onClick={() => insert("**bold**")} /><Tool icon={Italic} label={t("Italic")} onClick={() => insert("_italic_")} /><Tool icon={Quote} label={t("Quote")} onClick={() => insert("> ")} /><Tool icon={List} label={t("Bullet list")} onClick={() => insert("- ")} /><Tool icon={Link2} label={t("Link")} onClick={() => insert("[title](https://)")} /></div><textarea required minLength={1} maxLength={20000} rows={13} value={content} onChange={(event) => setContent(event.target.value)} className="w-full resize-y bg-transparent px-4 py-3 text-sm leading-6 outline-none" placeholder={t("Explain the context, what you have considered, and where you need input.")} /></div>
        </Field>
        <Field label={t("Tags")} hint={t("Comma-separated research concepts. LumiGap normalizes duplicates.")}><Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t("AI for SE, Code Review, Empirical Study")} /></Field>
        <section className="border-t pt-6"><div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-blue-700" /><h2 className="font-semibold">{t("Linked Research Context")}</h2></div><p className="mt-1 text-xs text-muted-foreground">{t("Only public or explicitly shareable research objects can appear in a forum discussion.")}</p><div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t(type === "PAPER_DISCUSSION" ? "Linked Paper *" : "Linked Paper")}><select value={linkedPaperId} onChange={(event) => setLinkedPaperId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">{t("No linked paper")}</option>{context?.papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title} ({paper.publicationYear})</option>)}</select></Field>
          <Field label={t(type === "RESEARCH_GAP_DISCUSSION" ? "Candidate Research Gap *" : "Candidate Research Gap")}><select value={linkedGapId} onChange={(event) => setLinkedGapId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">{t("No linked research gap")}</option>{gapOptions.map((gap) => <option key={gap.id} value={gap.id}>{gap.title}{gap.forumShareable ? "" : ` · ${t("Private")}`}</option>)}</select></Field>
          {selectedGap && !selectedGap.forumShareable ? <div className="sm:col-span-2 rounded-lg border p-3 text-sm"><p>{t("This candidate gap is private. Make it shareable before linking it to a forum thread.")}</p><Button type="button" variant="outline" size="sm" className="mt-3" disabled={shareGap.isPending} onClick={() => shareGap.mutateAsync(selectedGap.id).then(() => toast.success(t("Research gap is now shareable"))).catch(() => toast.error(t("Could not share this research gap")))}>{t("Make gap shareable")}</Button></div> : null}
          <Field label={t("Linked Project")} hint={t("Only projects with Public Summary visibility are listed.")}><select value={linkedProjectId} onChange={(event) => setLinkedProjectId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">{t("No linked project")}</option>{context?.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></Field>
        </div></section>
        <section className="border-t pt-6"><h2 className="font-semibold">{t("Add DOI Citation")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("Confirm the citation title before attaching DOI metadata.")}</p><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.5fr_110px]"><Input value={doi} onChange={(event) => setDoi(event.target.value)} placeholder="10.1000/example" /><Input value={citationTitle} onChange={(event) => setCitationTitle(event.target.value)} placeholder={t("Citation title")} /><Input type="number" min={1000} max={new Date().getFullYear() + 1} value={citationYear} onChange={(event) => setCitationYear(event.target.value)} placeholder={t("Year")} /></div></section>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={() => setPreview((value) => !value)}><Eye className="h-4 w-4" />{preview ? t("Hide preview") : t("Preview")}</Button><Button disabled={create.isPending || !joined.length}><Send className="h-4 w-4" />{create.isPending ? t("Publishing…") : t("Publish discussion")}</Button></div>
      </form>
      <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">{preview ? <section className="rounded-xl border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{t(THREAD_TYPES.find((option) => option.value === type)?.label ?? "Discussion")}</p><h2 className="mt-2 text-lg font-semibold leading-6">{title || t("Untitled discussion")}</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{content || t("Your discussion preview will appear here.")}</p></section> : null}<section className="rounded-xl border bg-muted/20 p-5"><h2 className="text-sm font-semibold">{t("Before publishing")}</h2><ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground"><li>{t("Keep claims specific and distinguish evidence from opinion.")}</li><li>{t("Cite literature when making concrete scholarly claims where possible.")}</li><li>{t("Do not expose private project artifacts or copyrighted full text.")}</li></ul></section></aside>
    </div>
  </main>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="block space-y-2"><span className="text-sm font-medium">{label}</span>{children}{hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}</label>; }
function Tool({ icon: Icon, label, onClick }: { icon: typeof Bold; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon className="h-4 w-4" /></button>; }
