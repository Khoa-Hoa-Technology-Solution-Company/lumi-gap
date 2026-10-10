import { useMemo, useState } from "react";
import type {
  AcademicIdentityLink,
  AcademicIdentityProvider,
  AcademicIdentityVisibility,
  AcademicProfile,
  PublicAcademicProfile,
} from "@trend/shared-types";
import {
  ArrowLeft,
  BookOpen,
  Database,
  ExternalLink,
  Fingerprint,
  GraduationCap,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
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

const providerOptions: Array<{ value: Exclude<AcademicIdentityProvider, "ORCID">; label: string }> = [
  { value: "GOOGLE_SCHOLAR", label: "Google Scholar" },
  { value: "SEMANTIC_SCHOLAR", label: "Semantic Scholar" },
  { value: "OPENALEX", label: "OpenAlex" },
  { value: "OTHER", label: "Other" },
];

const visibilityOptions: Array<{ value: AcademicIdentityVisibility; label: string }> = [
  { value: "PUBLIC", label: "Public" },
  { value: "REGISTERED_USERS", label: "LumiGap members" },
  { value: "PRIVATE", label: "Private" },
];

const providerLabels: Record<AcademicIdentityProvider, string> = {
  ORCID: "ORCID", OPENALEX: "OpenAlex", GOOGLE_SCHOLAR: "Google Scholar",
  SEMANTIC_SCHOLAR: "Semantic Scholar", OTHER: "Other academic profile",
};
const inputLabels: Record<AcademicIdentityProvider, string> = {
  ORCID: "ORCID iD", OPENALEX: "Author ID or URL", SEMANTIC_SCHOLAR: "URL or Author ID",
  GOOGLE_SCHOLAR: "Profile URL", OTHER: "Profile URL",
};

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function emptyDraft(): DraftIdentity {
  return { provider: "", label: "", value: "", visibility: "PUBLIC" };
}

type DraftIdentity = {
  provider: AcademicIdentityProvider | "";
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

function isProviderConnected(identity: AcademicIdentityLink): boolean {
  return identity.provider === "ORCID" && identity.connectionMethod === "OAUTH"
    && identity.verificationStatus === "PROVIDER_CONNECTED";
}

type Translate = ReturnType<typeof useI18n>["t"];

function visibilityLabel(visibility: AcademicIdentityVisibility, t: Translate): string {
  return t(visibilityOptions.find((option) => option.value === visibility)?.label ?? visibility);
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
  if (!draft.provider) return "Choose a service.";
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
  if (draft.provider === "OTHER" && !isHttpUrl(value)) return "Use the full profile URL.";
  if (value.startsWith("http") && !isHttpUrl(value)) return "Profile URLs must use HTTP or HTTPS.";
  return undefined;
}

function draftPayload(draft: DraftIdentity) {
  if (!draft.provider) throw new Error("Choose a service.");
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
  const { t } = useI18n();
  const linksQuery = useAcademicIdentityLinks(editable);
  const create = useCreateAcademicIdentity();
  const update = useUpdateAcademicIdentity();
  const remove = useDeleteAcademicIdentity();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<"choice" | "other">("choice");
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
    setStep("choice");
    setDialogOpen(true);
  }

  function openEdit(identity: AcademicIdentityLink) {
    setEditing(identity);
    setDraft({ provider: identity.provider, label: identity.label ?? "", value: valueForIdentity(identity), visibility: identity.visibility });
    setFormError(null);
    setStep("other");
    setMenuId(null);
    setDialogOpen(true);
  }

  async function submit() {
    const error = validateDraft(draft);
    if (error) {
      setFormError(t(error));
      return;
    }
    setFormError(null);
    try {
      if (editing && isProviderConnected(editing)) await update.mutateAsync({ identityId: editing.id, input: { visibility: draft.visibility } });
      else if (editing) await update.mutateAsync({ identityId: editing.id, input: {
        ...draftPayload(draft),
        identifier: isHttpUrl(draft.value.trim()) ? null : draft.value.trim(),
        profileUrl: isHttpUrl(draft.value.trim()) ? draft.value.trim() : null,
      } });
      else await create.mutateAsync(draftPayload(draft));
      setDialogOpen(false);
      setNotice(t(editing ? "Academic identity updated." : "Academic identity added."));
      toast.success(t(editing ? "Academic identity updated" : "Academic identity added"));
    } catch (error) {
      const response = error as { response?: { data?: { error?: { message?: string } } } };
      setFormError(response.response?.data?.error?.message ?? t("Could not save this academic identity."));
    }
  }

  async function confirmDelete(identity: AcademicIdentityLink) {
    try {
      await remove.mutateAsync(identity.id);
      setDeleteId(null);
      setMenuId(null);
      setNotice(t("Academic identity removed."));
      toast.success(t("Academic identity removed"));
    } catch (error) {
      const response = error as { response?: { data?: { error?: { message?: string } } } };
      setNotice(response.response?.data?.error?.message ?? t("Could not remove this academic identity."));
    }
  }

  async function changeVisibility(identity: AcademicIdentityLink, visibility: AcademicIdentityVisibility) {
    try {
      await update.mutateAsync({ identityId: identity.id, input: { visibility } });
      toast.success(t("Profile visibility updated."));
    } catch {
      toast.error(t("Could not update profile visibility."));
    }
  }

  const busy = create.isPending || update.isPending;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Scholarly profiles")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("Link your scholarly identity and work.")}</p>
        </div>
        {editable && <Button type="button" size="sm" onClick={openCreate} className="shrink-0 gap-1.5"><Plus className="h-4 w-4" />{t("Add academic identity")}</Button>}
      </div>
      {notice && <p role="status" className="text-xs font-medium text-[#0f6870] dark:text-teal-300">{notice}</p>}
      {editable && linksQuery.isLoading && <div className="space-y-2" role="status" aria-label={t("Loading academic identities")}><div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" /><div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" /></div>}
      {editable && linksQuery.isError && <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#f0c9c3] bg-[#fff6f4] px-1 py-3 text-sm text-[#9c3d34] dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><span>{t("Could not load academic identities.")}</span><Button type="button" variant="outline" size="sm" onClick={() => linksQuery.refetch()}>{t("Try again")}</Button></div>}
      {!linksQuery.isLoading && !linksQuery.isError && links.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("No academic profiles added yet.")}</p>}
      {links.length > 0 && <div className="space-y-2">{links.map((identity) => {
        const viewUrl = safeViewUrl(identity);
        const isDeleting = deleteId === identity.id;
        const connected = isProviderConnected(identity);
        return <article key={identity.id} className="relative flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-[#101923]">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${providerTone(identity.provider)}`}>{providerIcon(identity.provider)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 data-no-i18n className="text-sm font-semibold">{identity.label || providerLabels[identity.provider]}</h3>
              <Badge variant="outline" className={connected ? "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200" : "text-muted-foreground"}>{t(connected ? "Connected" : "Self-declared")}</Badge>
            </div>
            <p className="mt-1 break-all text-xs text-muted-foreground">{identity.identifier || identity.profileUrl}</p>
            {!connected && <p className="mt-1 text-[11px] text-muted-foreground">{visibilityLabel(identity.visibility, t)}</p>}
          </div>
          <div className="flex items-center gap-1">
            {viewUrl && <Button variant="outline" size="sm" asChild><a href={viewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />{t("View profile")}</a></Button>}
            {editable && (connected ? <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteId(identity.id)}>{t("Disconnect")}</Button> : <div className="relative">
              <Button type="button" variant="ghost" size="icon" aria-label={t("Actions for {{name}}", { name: identity.label || providerLabels[identity.provider] })} aria-expanded={menuId === identity.id} onClick={() => setMenuId(menuId === identity.id ? null : identity.id)}><MoreHorizontal className="h-4 w-4" /></Button>
              {menuId === identity.id && <div className="absolute right-0 top-10 z-10 w-32 rounded-lg border border-border bg-background p-1 shadow-lg">
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted" onClick={() => openEdit(identity)}><Pencil className="h-3.5 w-3.5" />{t("Edit")}</button>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-destructive hover:bg-muted" onClick={() => { setDeleteId(identity.id); setMenuId(null); }}><Trash2 className="h-3.5 w-3.5" />{t("Remove")}</button>
              </div>}
            </div>)}
          </div>
          {connected && (editable ? <div className="w-full border-t border-border pt-3">
            <Label htmlFor={`identity-visibility-${identity.id}`} className="text-xs">{t("Profile visibility")}</Label>
            <select id={`identity-visibility-${identity.id}`} className={`${selectClass} mt-2 sm:max-w-56`} value={identity.visibility} disabled={update.isPending} onChange={(event) => void changeVisibility(identity, event.target.value as AcademicIdentityVisibility)}>{visibilityOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select>
            <p className="mt-1.5 text-xs text-muted-foreground">{t("Visibility only determines who can view this profile.")}</p>
          </div> : <p className="w-full text-xs text-muted-foreground">{visibilityLabel(identity.visibility, t)}</p>)}
          {isDeleting && <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-border pt-3 text-xs"><span className="mr-auto text-muted-foreground">{t(connected ? "Disconnect ORCID from LumiGap?" : "Remove this identity?")}</span><Button type="button" variant="ghost" size="sm" onClick={() => setDeleteId(null)}>{t("Cancel")}</Button><Button type="button" variant="destructive" size="sm" disabled={remove.isPending} onClick={() => void confirmDelete(identity)}>{remove.isPending ? t("Removing…") : t(connected ? "Disconnect" : "Remove")}</Button></div>}
        </article>;
      })}</div>}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t(editing ? "Edit academic identity" : "Add academic identity")}</DialogTitle>
            <DialogDescription className="sr-only">{t("Connect ORCID or add a self-declared scholarly profile.")}</DialogDescription>
          </DialogHeader>
          {!editing && step === "choice" ? <div className="space-y-5 pt-1">
            <section className="space-y-3 rounded-lg border border-border p-4" aria-label="ORCID">
              <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#a6ce39] text-white text-xs font-semibold" aria-hidden="true">iD</span><h4 className="text-sm font-semibold">ORCID</h4></div>
              {links.some((identity) => identity.provider === "ORCID") ? <>
                {links.filter((identity) => identity.provider === "ORCID").map((identity) => <div key={identity.id} className="space-y-1 text-sm"><p className="break-all text-muted-foreground">{identity.identifier || identity.profileUrl}</p><p>{t(isProviderConnected(identity) ? "ORCID connected" : "Self-declared")}</p></div>)}
              </> : <>
                <p className="text-sm leading-6 text-muted-foreground">{t("Connect ORCID to link your scholarly identifier with LumiGap.")}</p>
                {/* No ORCID OAuth endpoint exists yet. Never turn a manual ID into a provider connection. */}
                <Button type="button" variant="outline" className="w-full" disabled aria-describedby="orcid-unavailable">{t("Connect ORCID")}</Button>
                <p id="orcid-unavailable" className="text-xs text-muted-foreground">{t("ORCID connection is not available yet.")}</p>
              </>}
            </section>
            <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("Or")}<span className="h-px flex-1 bg-border" /></div>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setStep("other")}><Plus className="h-4 w-4" />{t("Add another academic profile")}</Button>
          </div> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            {!editing && <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" onClick={() => { setStep("choice"); setFormError(null); }}><ArrowLeft className="h-3.5 w-3.5" />{t("Back")}</Button>}
            {editing ? <p data-no-i18n className="text-sm font-semibold">{editing.label || providerLabels[editing.provider]}</p> : <div className="space-y-2">
              <Label htmlFor="academic-identity-provider">{t("Service")}</Label>
              <select id="academic-identity-provider" className={selectClass} value={draft.provider} onChange={(event) => { setDraft((current) => ({ ...current, provider: event.target.value as DraftIdentity["provider"], label: "", value: "" })); setFormError(null); }}>
                <option value="">{t("Choose a service")}</option>
                {providerOptions.map((option) => <option data-no-i18n key={option.value} value={option.value}>{option.value === "OTHER" ? t(option.label) : option.label}</option>)}
              </select>
            </div>}
            {draft.provider && <>
              <p className="text-xs text-muted-foreground">{t(editing && isProviderConnected(editing) ? "ORCID connected" : "This profile is self-declared.")}</p>
              {draft.provider === "OTHER" && <div className="space-y-2"><Label htmlFor="academic-identity-label">{t("Service name")}</Label><Input id="academic-identity-label" value={draft.label} maxLength={120} required onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} placeholder={t("e.g. University researcher profile")} /></div>}
              <div className="space-y-2">
                <Label htmlFor="academic-identity-value">{t(inputLabels[draft.provider])}</Label>
                <Input id="academic-identity-value" value={draft.value} type={draft.provider === "GOOGLE_SCHOLAR" || draft.provider === "OTHER" ? "url" : "text"} required maxLength={500} readOnly={Boolean(editing && isProviderConnected(editing))} onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))} placeholder={draft.provider === "ORCID" ? "0000-0002-1825-0097" : draft.provider === "OPENALEX" ? "A123456789" : draft.provider === "SEMANTIC_SCHOLAR" ? "123456789" : draft.provider === "GOOGLE_SCHOLAR" ? "https://scholar.google.com/citations?user=…" : "https://example.edu/profile"} />
              </div>
              <div className="space-y-2 border-t border-border pt-4">
                <Label htmlFor="academic-identity-visibility">{t("Profile visibility")}</Label>
                <select id="academic-identity-visibility" className={selectClass} value={draft.visibility} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as AcademicIdentityVisibility }))}>{visibilityOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select>
                <p className="text-xs leading-5 text-muted-foreground">{t("Visibility only determines who can view this profile.")}</p>
              </div>
            </>}
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <DialogFooter className="gap-2 pt-1"><Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>{t("Cancel")}</Button><Button type="submit" disabled={busy || !draft.provider}>{busy ? t("Saving…") : editing ? t("Save changes") : t("Add profile")}</Button></DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
