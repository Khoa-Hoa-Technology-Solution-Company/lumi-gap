import { useMemo, useState, type ReactNode } from "react";
import type {
  AcademicIdentityLink,
  AcademicIdentityProvider,
  AcademicIdentityVisibility,
  AcademicProfile,
  PublicAcademicProfile,
} from "@trend/shared-types";
import {
  BadgeCheck,
  BookOpen,
  Database,
  Eye,
  ExternalLink,
  Fingerprint,
  GraduationCap,
  Link2,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAcademicIdentityLinks,
  useCreateAcademicIdentity,
  useDeleteAcademicIdentity,
  useUpdateAcademicIdentity,
} from "../hooks/use-academic-profile";

type ProfileWithAcademicIdentities = AcademicProfile | PublicAcademicProfile;

const providerOptions: Array<{ value: AcademicIdentityProvider; label: string; hint: string }> = [
  { value: "ORCID", label: "ORCID", hint: "Persistent researcher identifier" },
  { value: "OPENALEX", label: "OpenAlex", hint: "Author profile or ID" },
  { value: "GOOGLE_SCHOLAR", label: "Google Scholar", hint: "Citations profile" },
  { value: "SEMANTIC_SCHOLAR", label: "Semantic Scholar", hint: "Author profile or ID" },
  { value: "OTHER", label: "Other academic profile", hint: "A scholarly profile not listed above" },
];

const visibilityOptions: Array<{ value: AcademicIdentityVisibility; label: string; icon: ReactNode }> = [
  { value: "PUBLIC", label: "Public", icon: <Eye className="h-3.5 w-3.5" /> },
  { value: "REGISTERED_USERS", label: "Registered users", icon: <Users className="h-3.5 w-3.5" /> },
  { value: "PRIVATE", label: "Private", icon: <LockKeyhole className="h-3.5 w-3.5" /> },
];

const providerLabels: Record<AcademicIdentityProvider, string> = Object.fromEntries(
  providerOptions.map((option) => [option.value, option.label]),
) as Record<AcademicIdentityProvider, string>;

function emptyDraft(): DraftIdentity {
  return { provider: "ORCID", label: "", value: "", visibility: "PUBLIC" };
}

type DraftIdentity = {
  provider: AcademicIdentityProvider;
  label: string;
  value: string;
  visibility: AcademicIdentityVisibility;
};

function providerIcon(provider: AcademicIdentityProvider) {
  if (provider === "ORCID") return <Fingerprint className="h-4 w-4" />;
  if (provider === "OPENALEX") return <Database className="h-4 w-4" />;
  if (provider === "GOOGLE_SCHOLAR") return <GraduationCap className="h-4 w-4" />;
  if (provider === "SEMANTIC_SCHOLAR") return <BookOpen className="h-4 w-4" />;
  return <Link2 className="h-4 w-4" />;
}

function providerTone(provider: AcademicIdentityProvider): string {
  if (provider === "ORCID") return "bg-[#e8f6f4] text-[#0f7b83] dark:bg-teal-950/50 dark:text-teal-300";
  if (provider === "OPENALEX") return "bg-[#fff0dc] text-[#b2642c] dark:bg-amber-950/50 dark:text-amber-300";
  if (provider === "GOOGLE_SCHOLAR") return "bg-[#e7effb] text-[#365d97] dark:bg-blue-950/50 dark:text-blue-300";
  if (provider === "SEMANTIC_SCHOLAR") return "bg-[#eee8fb] text-[#6949a4] dark:bg-violet-950/50 dark:text-violet-300";
  return "bg-[#fdeee8] text-[#b34e38] dark:bg-rose-950/50 dark:text-rose-300";
}

function statusTone(status: AcademicIdentityLink["status"]): string {
  if (status === "CONNECTED" || status === "LINKED") return "border-[#b9e5e1] bg-[#e8f6f4] text-[#14545b] dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200";
  if (status === "INVALID") return "border-[#f0c9c3] bg-[#fff0ee] text-[#9c3d34] dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300";
}

function statusLabel(status: AcademicIdentityLink["status"]): string {
  return status === "SELF_DECLARED" ? "Self-declared" : status.charAt(0) + status.slice(1).toLowerCase();
}

function visibilityLabel(visibility: AcademicIdentityVisibility): string {
  return visibilityOptions.find((option) => option.value === visibility)?.label ?? visibility;
}

function safeViewUrl(identity: AcademicIdentityLink): string | undefined {
  if (identity.profileUrl) {
    try {
      const url = new URL(identity.profileUrl);
      if ((url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password) return url.toString();
    } catch {
      return undefined;
    }
  }
  const identifier = identity.identifier?.trim();
  if (!identifier) return undefined;
  if (identity.provider === "ORCID" && /^\d{4}-\d{4}-\d{4}-[\dX]{4}$/i.test(identifier)) return `https://orcid.org/${encodeURIComponent(identifier)}`;
  if (identity.provider === "OPENALEX" && /^A\d+$/i.test(identifier)) return `https://openalex.org/${encodeURIComponent(identifier)}`;
  if (identity.provider === "SEMANTIC_SCHOLAR") return `https://www.semanticscholar.org/author/${encodeURIComponent(identifier)}`;
  return undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isValidOrcid(value: string): boolean {
  const normalized = value.replace(/^https?:\/\/orcid\.org\//i, "").toUpperCase();
  if (!/^\d{4}-\d{4}-\d{4}-[\dX]{4}$/.test(normalized)) return false;
  const chars = normalized.replaceAll("-", "");
  let total = 0;
  for (const char of chars.slice(0, 15)) total = (total + Number(char)) * 2;
  const remainder = (12 - (total % 11)) % 11;
  return chars[15] === (remainder === 10 ? "X" : String(remainder));
}

function validateDraft(draft: DraftIdentity): string | undefined {
  const value = draft.value.trim();
  if (!value) return "Enter an identifier or profile URL.";
  if (draft.provider === "OTHER" && !draft.label.trim()) return "Add a profile name for this academic profile.";
  if (draft.provider === "ORCID" && !isValidOrcid(value)) return "Enter a valid ORCID iD, including its checksum.";
  if (draft.provider === "OPENALEX") {
    const id = value.replace(/^https?:\/\/openalex\.org\//i, "").replace(/\/$/, "");
    if (!/^A\d+$/i.test(id)) return "Use an OpenAlex Author ID such as A123456789 or its profile URL.";
  }
  if (draft.provider === "GOOGLE_SCHOLAR") {
    if (!isHttpUrl(value)) return "Use the full Google Scholar profile URL.";
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "scholar.google.com" || !/^\/citations\/?$/i.test(url.pathname) || !url.searchParams.get("user")) return "Use a Google Scholar citations URL containing a user ID.";
  }
  if (draft.provider === "SEMANTIC_SCHOLAR" && isHttpUrl(value)) {
    const url = new URL(value);
    if (!/^(www\.)?semanticscholar\.org$/i.test(url.hostname) || !/^\/author\//i.test(url.pathname)) return "Use a Semantic Scholar author profile URL.";
  }
  if (value.startsWith("http") && !isHttpUrl(value)) return "Profile URLs must use HTTP or HTTPS.";
  return undefined;
}

function draftPayload(draft: DraftIdentity) {
  const value = draft.value.trim();
  const isUrl = /^https?:\/\//i.test(value);
  return {
    provider: draft.provider,
    ...(draft.provider === "OTHER" ? { label: draft.label.trim() || undefined } : {}),
    identifier: isUrl ? undefined : value,
    profileUrl: isUrl ? value : undefined,
    visibility: draft.visibility,
  };
}

function valueForIdentity(identity: AcademicIdentityLink): string {
  return identity.profileUrl ?? identity.identifier ?? "";
}

export function AcademicIdentityManager({ profile, editable }: { profile: ProfileWithAcademicIdentities; editable: boolean }) {
  const linksQuery = useAcademicIdentityLinks(editable);
  const create = useCreateAcademicIdentity();
  const update = useUpdateAcademicIdentity();
  const remove = useDeleteAcademicIdentity();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicIdentityLink | null>(null);
  const [draft, setDraft] = useState<DraftIdentity>(emptyDraft);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const links = useMemo(() => editable && linksQuery.data ? linksQuery.data : profile.academicIdentityLinks, [editable, linksQuery.data, profile.academicIdentityLinks]);

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(identity: AcademicIdentityLink) {
    setEditing(identity);
    setDraft({ provider: identity.provider, label: identity.label ?? "", value: valueForIdentity(identity), visibility: identity.visibility });
    setFormError(null);
    setMenuId(null);
    setDialogOpen(true);
  }

  async function submit() {
    const error = validateDraft(draft);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    try {
      if (editing) await update.mutateAsync({ identityId: editing.id, input: draftPayload(draft) });
      else await create.mutateAsync(draftPayload(draft));
      setDialogOpen(false);
      setNotice(editing ? "Academic identity updated." : "Academic identity added.");
      toast.success(editing ? "Academic identity updated" : "Academic identity added");
    } catch (error) {
      const response = error as { response?: { data?: { error?: { message?: string } } } };
      setFormError(response.response?.data?.error?.message ?? "Could not save this academic identity.");
    }
  }

  async function confirmDelete(identity: AcademicIdentityLink) {
    try {
      await remove.mutateAsync(identity.id);
      setDeleteId(null);
      setMenuId(null);
      setNotice("Academic identity removed.");
      toast.success("Academic identity removed");
    } catch (error) {
      const response = error as { response?: { data?: { error?: { message?: string } } } };
      setNotice(response.response?.data?.error?.message ?? "Could not remove this academic identity.");
    }
  }

  const busy = create.isPending || update.isPending;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Connect your scholarly profiles to make your research identity easier to discover.</p>
        {editable && <Button type="button" size="sm" onClick={openCreate} className="gap-1.5"><Plus className="h-4 w-4" />Add academic identity</Button>}
      </div>
      {notice && <p role="status" className="text-xs font-medium text-[#0f6870] dark:text-teal-300">{notice}</p>}
      {editable && linksQuery.isLoading && <div className="space-y-2" role="status" aria-label="Loading academic identities"><div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" /><div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" /></div>}
      {editable && linksQuery.isError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f0c9c3] bg-[#fff6f4] px-4 py-3 text-sm text-[#9c3d34] dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><span>Could not load academic identities.</span><Button type="button" variant="outline" size="sm" onClick={() => linksQuery.refetch()}>Try again</Button></div>}
      {!linksQuery.isLoading && !linksQuery.isError && links.length === 0 && <div className="rounded-xl border border-dashed border-[#b9e5e1] bg-[#f7fcfb] px-5 py-7 text-center dark:border-teal-900 dark:bg-teal-950/20"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f6f4] text-[#0f7b83] dark:bg-teal-950/60 dark:text-teal-300"><Link2 className="h-5 w-5" /></div><p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">No academic identities added yet</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">Add ORCID, OpenAlex, Scholar profiles, or another scholarly link. These links never verify your academic position automatically.</p>{editable && <Button type="button" variant="outline" size="sm" onClick={openCreate} className="mt-4 gap-1.5"><Plus className="h-4 w-4" />Add academic identity</Button>}</div>}
      {links.length > 0 && <div className="space-y-2">{links.map((identity) => {
        const viewUrl = safeViewUrl(identity);
        const isDeleting = deleteId === identity.id;
        return <article key={identity.id} className="relative flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-[#101923]">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${providerTone(identity.provider)}`}>{providerIcon(identity.provider)}</span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{identity.label || providerLabels[identity.provider]}</h3><Badge variant="outline" className={`px-2 py-0.5 text-[11px] ${statusTone(identity.status)}`}>{identity.status === "LINKED" && <BadgeCheck className="mr-1 h-3 w-3" />}{statusLabel(identity.status)}</Badge></div><p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{identity.identifier || identity.profileUrl}</p><p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400"><span className="text-slate-500">{visibilityLabel(identity.visibility)}</span></p></div>
          <div className="flex items-center gap-1"><Button type="button" variant="outline" size="sm" disabled={!viewUrl} asChild={Boolean(viewUrl)}>{viewUrl ? <a href={viewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />View</a> : <span><ExternalLink className="h-3.5 w-3.5" />View</span>}</Button>{editable && <div className="relative"><Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${identity.label || providerLabels[identity.provider]}`} aria-expanded={menuId === identity.id} onClick={() => setMenuId(menuId === identity.id ? null : identity.id)}><MoreHorizontal className="h-4 w-4" /></Button>{menuId === identity.id && <div className="absolute right-0 top-10 z-10 w-32 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"><button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => openEdit(identity)}><Pencil className="h-3.5 w-3.5" />Edit</button><button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40" onClick={() => { setDeleteId(identity.id); setMenuId(null); }}><Trash2 className="h-3.5 w-3.5" />Remove</button></div>}</div>}</div>
          {isDeleting && <div className="flex w-full items-center justify-end gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800"><span className="mr-auto text-slate-500">Remove this identity?</span><Button type="button" variant="ghost" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button><Button type="button" variant="destructive" size="sm" disabled={remove.isPending} onClick={() => void confirmDelete(identity)}>{remove.isPending ? "Removing…" : "Remove"}</Button></div>}
        </article>;
      })}</div>}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit academic identity" : "Add academic identity"}</DialogTitle><DialogDescription>{editing ? "Update this scholarly profile link and its visibility." : "Choose one provider to show only the fields needed for that profile."}</DialogDescription></DialogHeader>
          <div className="space-y-5 py-1">
            <div className="space-y-2"><Label htmlFor="academic-identity-provider">Provider</Label><select id="academic-identity-provider" className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-zinc-950" value={draft.provider} onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value as AcademicIdentityProvider, label: event.target.value === "OTHER" ? current.label : "", value: "" }))}>{providerOptions.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.hint}</option>)}</select></div>
            {draft.provider === "OTHER" && <div className="space-y-2"><Label htmlFor="academic-identity-label">Profile name</Label><Input id="academic-identity-label" value={draft.label} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} placeholder="e.g. University researcher profile" /></div>}
            <div className="space-y-2"><Label htmlFor="academic-identity-value">{draft.provider === "ORCID" ? "ORCID iD" : draft.provider === "GOOGLE_SCHOLAR" ? "Scholar profile URL" : draft.provider === "OTHER" ? "Profile URL / identifier" : `${providerLabels[draft.provider]} Author ID or profile URL`}</Label><Input id="academic-identity-value" value={draft.value} onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))} placeholder={draft.provider === "ORCID" ? "0000-0002-1825-0097" : draft.provider === "OPENALEX" ? "A123456789 or https://openalex.org/A123456789" : draft.provider === "GOOGLE_SCHOLAR" ? "https://scholar.google.com/citations?user=..." : draft.provider === "SEMANTIC_SCHOLAR" ? "Author ID or https://www.semanticscholar.org/author/..." : "https://example.edu/profile or identifier"} autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="academic-identity-visibility">Visibility</Label><select id="academic-identity-visibility" className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-zinc-950" value={draft.visibility} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as AcademicIdentityVisibility }))}>{visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><p className="text-xs text-slate-500">Visibility controls who can see the link, not whether it is verified.</p></div>
            {formError && <p role="alert" className="rounded-lg border border-[#f0c9c3] bg-[#fff6f4] px-3 py-2 text-sm text-[#9c3d34] dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{formError}</p>}
          </div>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="button" onClick={() => void submit()} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add identity"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
