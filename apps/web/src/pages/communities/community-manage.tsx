import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Shield, ShieldAlert, UserRoundCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CommunityRestrictionType } from "@trend/shared-types";
import {
  type CommunityMemberView,
  type CommunityView,
  useCommunity,
  useCommunityMembers,
  useLiftCommunityRestriction,
  useRestrictCommunityMember,
  useSetCommunityStatus,
  useTransferCommunityOwnership,
  useUpdateCommunity,
  useUpdateCommunityMember,
} from "@/features/forum";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { CommunityModerationTab } from "./community-moderation-tab";

type Tab = "settings" | "members" | "moderation";
type MemberChange = { role?: "moderator" | "member"; status?: "active" | "banned" };

const splitLines = (value: string) => [...new Set(value.split("\n").map((item) => item.trim()).filter(Boolean))];
const splitValues = (value: string) => [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
const requestError = (error: unknown, fallback: string) => (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");

export function CommunityManagePage() {
  const { t } = useI18n();
  const { slug = "" } = useParams();
  const { data: community, isLoading, error } = useCommunity(slug);
  const [params, setParams] = useSearchParams();

  if (isLoading) return <main className="mx-auto max-w-5xl px-4 py-8"><div className="h-80 animate-pulse rounded-xl bg-muted" /></main>;
  if (error || !community) return <Unavailable message={t("Community unavailable.")} />;
  if (!community.canManage) return <Unavailable message={t("You do not have permission to manage this community.")} community={community} />;

  const tabs: Array<{ value: Tab; label: string; icon: typeof Shield }> = [
    ...(community.canEditCommunity ? [{ value: "settings" as const, label: "Settings and rules", icon: Shield }] : []),
    { value: "members", label: "Members", icon: UserRoundCog },
    { value: "moderation", label: "Moderation", icon: ShieldAlert },
  ];

  // The tab lives in the URL (`?tab=`), so links and Back work. An unknown or unavailable value falls back to the default tab.
  const requested = params.get("tab");
  const tab: Tab = tabs.some((item) => item.value === requested) ? requested as Tab : (community.canEditCommunity ? "settings" : "members");
  const setTab = (value: Tab) => setParams((current) => { const next = new URLSearchParams(current); next.set("tab", value); return next; });

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <Link to={`/communities/${community.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-blue-700"><ArrowLeft className="h-4 w-4" />{t("Back to community")}</Link>
    <header className="mt-5 border-b pb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{t("Community management")}</p>
      <h1 className="lumi-page-title mt-2">{community.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("Manage membership and community settings within your permission scope.")}</p>
    </header>
    <nav className="mt-5 flex gap-1 overflow-x-auto border-b" aria-label={t("Community management sections")}>
      {tabs.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => setTab(value)}
        className={cn("inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === value ? "border-blue-700 text-blue-700" : "border-transparent text-muted-foreground hover:text-foreground")}>
        <Icon className="h-4 w-4" />{t(label)}
      </button>)}
    </nav>
    <div className="mt-7">
      {tab === "settings" && community.canEditCommunity ? <Settings community={community} />
        : tab === "moderation" ? <CommunityModerationTab community={community} frozen={community.status === "ARCHIVED" && !community.isAdmin} />
          : <MemberList community={community} />}
    </div>
  </main>;
}

function Unavailable({ message, community }: { message: string; community?: CommunityView }) {
  const { t } = useI18n();
  return <main className="mx-auto max-w-2xl px-4 py-16 text-center">
    <h1 className="text-2xl font-semibold">{t("Management unavailable")}</h1>
    <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    <Button asChild variant="outline" className="mt-5"><Link to={community ? `/communities/${community.slug}` : "/communities"}>{t("Go back")}</Link></Button>
  </main>;
}

function Settings({ community }: { community: CommunityView }) {
  const { t } = useI18n();
  const update = useUpdateCommunity();
  const setStatusMutation = useSetCommunityStatus();
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [researchField, setResearchField] = useState(community.researchField ?? "");
  const [icon, setIcon] = useState(community.icon ?? "");
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">(community.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE");
  const [topics, setTopics] = useState(community.researchTopics.join(", "));
  const [rules, setRules] = useState(community.rules.join("\n"));
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const canChangeStatus = community.isAdmin && (community.status === "ACTIVE" || community.status === "ARCHIVED");
  const busy = update.isPending || setStatusMutation.isPending;
  const frozen = community.status === "ARCHIVED" && !community.isAdmin;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    try {
      await update.mutateAsync({ id: community.id, input: { name: name.trim(), description: description.trim(), researchField: researchField.trim() || undefined, icon: icon.trim() || undefined, researchTopics: splitValues(topics), rules: splitLines(rules) } });
      if (canChangeStatus && status !== community.status) await setStatusMutation.mutateAsync({ id: community.id, status });
      setMessage({ text: t("Community settings saved.") });
    } catch (reason) {
      setMessage({ text: requestError(reason, t("Could not save community settings.")), error: true });
    }
  }

  return <section className="max-w-3xl">
    <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-blue-700" /><h2 className="text-lg font-semibold">{t("Settings and rules")}</h2></div>
    <p className="mt-1 text-sm text-muted-foreground">{t("Owners and administrators can edit this community. Only administrators can archive it.")}</p>
    {frozen ? <p role="status" className="mt-3 text-sm text-muted-foreground">{t("This community is archived, so its settings are read-only. Only an administrator can change them.")}</p> : null}
    <form onSubmit={submit} className="mt-5">
      <fieldset disabled={frozen} className="min-w-0 space-y-5 border-0 p-0">
      <Field label={t("Community name")}><Input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
        <Field label={t("Research field")}><Input maxLength={160} value={researchField} onChange={(event) => setResearchField(event.target.value)} /></Field>
        <Field label={t("Icon key")}><Input maxLength={40} pattern="[A-Za-z0-9-]+" value={icon} onChange={(event) => setIcon(event.target.value)} /></Field>
      </div>
      <Field label={t("Description")}><textarea required maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></Field>
      <Field label={t("Research topics")} hint={t("Comma separated")}><Input value={topics} onChange={(event) => setTopics(event.target.value)} /></Field>
      <Field label={t("Community rules")} hint={t("One rule per line")}><textarea value={rules} onChange={(event) => setRules(event.target.value)} className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></Field>
      <div className="grid gap-5 sm:grid-cols-2">
        {canChangeStatus ? <Field label={t("Status")}>
          <select value={status} onChange={(event) => setStatus(event.target.value as "ACTIVE" | "ARCHIVED")} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="ACTIVE">{t("Active")}</option>
            <option value="ARCHIVED">{t("Archived, read-only")}</option>
          </select>
        </Field> : null}
      </div>
      {message ? <p role="status" className={`text-sm ${message.error ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p> : null}
      <Button variant="discussion" type="submit" disabled={busy || name.trim().length < 2 || !description.trim()}>{t(busy ? "Saving…" : "Save settings")}</Button>
      </fieldset>
    </form>
    {(community.isOwner || community.isAdmin) && community.status === "ACTIVE" ? <TransferOwnership community={community} /> : null}
  </section>;
}

function TransferOwnership({ community }: { community: CommunityView }) {
  const { t } = useI18n();
  const members = useCommunityMembers(community.id, true);
  const transfer = useTransferCommunityOwnership();
  const [targetId, setTargetId] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const candidates = useMemo(() => (members.data ?? []).filter((member) => member.status === "active" && member.role !== "owner"), [members.data]);
  const target = candidates.find((member) => member.user.id === targetId);

  async function confirm() {
    if (!target) return;
    setError("");
    try {
      await transfer.mutateAsync({ id: community.id, userId: target.user.id });
      setOpen(false);
      setTargetId("");
    } catch (reason) {
      setError(requestError(reason, t("Could not transfer ownership.")));
    }
  }

  return <div className="mt-10 border-t pt-7">
    <h3 className="text-base font-semibold">{t("Transfer ownership")}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{t("The new owner must be an active member. You become a moderator.")}</p>
    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
      <select value={targetId} onChange={(event) => setTargetId(event.target.value)} aria-label={t("New owner")} className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-sm">
        <option value="">{t("Select a member")}</option>
        {candidates.map((member) => <option key={member.id} value={member.user.id}>{member.user.fullName}</option>)}
      </select>
      <Button type="button" variant="outline" disabled={!target} onClick={() => setOpen(true)}>{t("Transfer ownership")}</Button>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Transfer ownership?")}</DialogTitle>
          <DialogDescription>{target ? `${target.user.fullName} — ${t("will own this community and manage its settings.")}` : ""}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
          <Button disabled={transfer.isPending} onClick={confirm}>{t(transfer.isPending ? "Working…" : "Confirm transfer")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

type MemberDialog =
  | { kind: "ban" | "restore"; member: CommunityMemberView }
  | { kind: "restrict"; member: CommunityMemberView }
  | { kind: "lift"; member: CommunityMemberView; restriction: NonNullable<CommunityMemberView["restrictions"]>[number] };

const RESTRICTION_LABELS: Record<CommunityRestrictionType, string> = { CREATE_THREAD: "Start discussions", REPLY: "Reply to discussions", POSTING: "Start discussions and reply" };
const DURATIONS: Array<1 | 7 | 30> = [1, 7, 30];

function MemberList({ community }: { community: CommunityView }) {
  const { t } = useI18n();
  const members = useCommunityMembers(community.id, community.canManage);
  const update = useUpdateCommunityMember();
  const restrict = useRestrictCommunityMember();
  const lift = useLiftCommunityRestriction();
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<MemberDialog>();
  const canManageStaff = community.isOwner || community.isAdmin;
  const frozen = community.status === "ARCHIVED" && !community.isAdmin;
  const rows = members.data ?? [];

  async function change(userId: string, input: MemberChange, success?: string) {
    setError("");
    try { await update.mutateAsync({ id: community.id, userId, input }); if (success) toast.success(t(success)); return true; }
    catch (reason) { setError(requestError(reason, t("Could not update this member."))); return false; }
  }

  return <section>
    <div className="flex items-center gap-2"><UserRoundCog className="h-4 w-4 text-blue-700" /><h2 className="text-lg font-semibold">{t("Members")}</h2></div>
    <p className="mt-1 text-sm text-muted-foreground">{t("Maintain community access and moderators.")}</p>
    {frozen ? <p role="status" className="mt-3 text-sm text-muted-foreground">{t("This community is archived, so membership can no longer be changed. Only an administrator can change it.")}</p> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-red-600">{error}</p> : null}
    {members.isLoading ? <div className="mt-5 space-y-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
      : members.error ? <p className="mt-5 text-sm text-red-600">{t("Unable to load members.")}</p>
        : rows.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">{t("No members yet.")}</p>
          : <div className="mt-5 divide-y border-y">{rows.map((member) => <MemberRow key={member.id} member={member} busy={update.isPending || restrict.isPending || lift.isPending || frozen} canManageStaff={canManageStaff} onChange={(userId, input) => change(userId, input)} onDialog={setDialog} />)}</div>}
    <MemberDialogs community={community} dialog={dialog} onClose={() => setDialog(undefined)} onBanOrRestore={async (member, status) => {
        try { await update.mutateAsync({ id: community.id, userId: member.user.id, input: { status } }); toast.success(t(status === "banned" ? "Member banned" : "Access restored")); setDialog(undefined); return undefined; }
        catch (reason) { return requestError(reason, t("Could not update this member.")); }
      }}
      updating={update.isPending}
      restrict={restrict} lift={lift} />
  </section>;
}

function MemberRow({ member, busy, canManageStaff, onChange, onDialog }: { member: CommunityMemberView; busy: boolean; canManageStaff: boolean; onChange: (userId: string, input: MemberChange) => void; onDialog: (dialog: MemberDialog) => void }) {
  const { t } = useI18n();
  const isOwner = member.role === "owner";
  // Mirror the API: only the owner or an admin can act on moderators; nobody acts on the owner.
  const canActOn = !isOwner && (member.role === "member" || canManageStaff);
  const restrictions = member.restrictions ?? [];
  return <div className="py-4">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
        {member.user.avatarUrl ? <img src={member.user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(member.user.fullName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{member.user.fullName}</p>
          <Badge variant="outline" className="font-normal">{t(member.role)}</Badge>
          <Badge variant="secondary" className="font-normal">{t(member.status)}</Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{member.user.email}{member.user.institution ? ` · ${member.user.institution}` : ""}</p>
        {restrictions.length ? <ul className="mt-2 flex flex-wrap gap-2">{restrictions.map((restriction) => <li key={restriction.id} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 py-1 pl-3 pr-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>{t(RESTRICTION_LABELS[restriction.type] ?? restriction.type)}{restriction.expiresAt ? ` · ${t("Restricted until")} ${new Date(restriction.expiresAt).toLocaleDateString()}` : ""}</span>
          {canActOn ? <Button size="sm" variant="ghost" className="h-8 min-h-11 px-2 text-xs sm:min-h-8" disabled={busy} onClick={() => onDialog({ kind: "lift", member, restriction })}>{t("Lift")}</Button> : null}
        </li>)}</ul> : null}
      </div>
    </div>
    {canActOn ? <div className="mt-3 flex flex-wrap gap-2 pl-12">
      {member.status === "banned"
        ? <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => onDialog({ kind: "restore", member })}>{t("Restore access")}</Button>
        : <>
          <Button size="sm" variant="ghost" className="min-h-11 text-red-600" disabled={busy} onClick={() => onDialog({ kind: "ban", member })}>{t("Ban member")}</Button>
          {member.status === "active" ? <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => onDialog({ kind: "restrict", member })}>{t("Restrict")}</Button> : null}
        </>}
      {canManageStaff && member.status === "active" ? <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => onChange(member.user.id, { role: member.role === "moderator" ? "member" : "moderator" })}>{t(member.role === "moderator" ? "Remove moderator" : "Make moderator")}</Button> : null}
    </div> : null}
  </div>;
}

/** Confirmation dialogs for every access-changing member action: ban, restore, restrict and lift. */
function MemberDialogs({ community, dialog, onClose, onBanOrRestore, updating, restrict, lift }: {
  community: CommunityView; dialog?: MemberDialog; onClose: () => void;
  /** Resolves to an error message when the change failed, so the dialog can show it where the user is looking. */
  onBanOrRestore: (member: CommunityMemberView, status: "banned" | "active") => Promise<string | undefined>;
  updating: boolean;
  restrict: ReturnType<typeof useRestrictCommunityMember>; lift: ReturnType<typeof useLiftCommunityRestriction>;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<CommunityRestrictionType>("CREATE_THREAD");
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const reset = () => { setType("CREATE_THREAD"); setDays(7); setReason(""); setError(""); };
  const close = () => { reset(); onClose(); };
  const name = dialog?.member.user.fullName ?? "";

  async function submitBanOrRestore(member: CommunityMemberView, status: "banned" | "active") {
    setError("");
    const failure = await onBanOrRestore(member, status);
    if (failure) setError(failure); else reset();
  }
  async function submitRestriction(member: CommunityMemberView) {
    setError("");
    try { await restrict.mutateAsync({ id: community.id, userId: member.user.id, input: { type, durationDays: days, reason: reason.trim() } }); toast.success(t("Member restricted")); close(); }
    catch (failure) { setError(requestError(failure, t("Could not restrict this member."))); }
  }
  async function submitLift(member: CommunityMemberView, restrictionId: string) {
    setError("");
    try { await lift.mutateAsync({ id: community.id, userId: member.user.id, restrictionId }); toast.success(t("Restriction lifted")); close(); }
    catch (failure) { setError(requestError(failure, t("Could not update this member."))); }
  }

  return <Dialog open={Boolean(dialog)} onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent>
      {dialog?.kind === "ban" || dialog?.kind === "restore" ? <>
        <DialogHeader>
          <DialogTitle>{t(dialog.kind === "ban" ? "Ban this member?" : "Restore access?")}</DialogTitle>
          <DialogDescription>{name} — {t(dialog.kind === "ban" ? "They will no longer be able to post or reply here until access is restored." : "They will be able to take part in this community again.")}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" className="min-h-11" onClick={close}>{t("Cancel")}</Button>
          <Button variant={dialog.kind === "ban" ? "destructive" : "default"} className="min-h-11" disabled={updating} onClick={() => void submitBanOrRestore(dialog.member, dialog.kind === "ban" ? "banned" : "active")}>{t(updating ? "Working…" : dialog.kind === "ban" ? "Ban member" : "Restore access")}</Button>
        </DialogFooter>
      </> : dialog?.kind === "restrict" ? <>
        <DialogHeader>
          <DialogTitle>{t("Restrict this member")}</DialogTitle>
          <DialogDescription>{name} — {t("The restriction applies in this community only and ends by itself.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm"><span className="font-medium">{t("Restriction type")}</span>
            <select value={type} onChange={(event) => setType(event.target.value as CommunityRestrictionType)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
              {(Object.keys(RESTRICTION_LABELS) as CommunityRestrictionType[]).map((value) => <option key={value} value={value}>{t(RESTRICTION_LABELS[value])}</option>)}
            </select></label>
          <label className="space-y-2 text-sm"><span className="font-medium">{t("Duration")}</span>
            <select value={days} onChange={(event) => setDays(Number(event.target.value) as 1 | 7 | 30)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
              {DURATIONS.map((value) => <option key={value} value={value}>{t(`${value} ${value === 1 ? "day" : "days"}`)}</option>)}
            </select></label>
        </div>
        <label className="space-y-2 text-sm"><span className="font-medium">{t("Reason")}</span>
          <Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={t("Reason (at least 3 characters)")} className="h-11" aria-describedby="restrict-reason-hint" /></label>
        {reason.trim().length < 3 ? <p id="restrict-reason-hint" role="status" className="text-sm text-muted-foreground">{t("Enter a reason of at least 3 characters to continue.")}</p> : null}
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" className="min-h-11" onClick={close}>{t("Cancel")}</Button>
          <Button className="min-h-11" disabled={reason.trim().length < 3 || restrict.isPending} onClick={() => void submitRestriction(dialog.member)}>{t(restrict.isPending ? "Working…" : "Restrict member")}</Button>
        </DialogFooter>
      </> : dialog?.kind === "lift" ? <>
        <DialogHeader>
          <DialogTitle>{t("Lift this restriction?")}</DialogTitle>
          <DialogDescription>{name} — {t(RESTRICTION_LABELS[dialog.restriction.type] ?? dialog.restriction.type)}. {t("The member will be able to post again straight away.")}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" className="min-h-11" onClick={close}>{t("Cancel")}</Button>
          <Button className="min-h-11" disabled={lift.isPending} onClick={() => void submitLift(dialog.member, dialog.restriction.id)}>{t(lift.isPending ? "Working…" : "Lift restriction")}</Button>
        </DialogFooter>
      </> : null}
    </DialogContent>
  </Dialog>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-2"><div className="flex items-end justify-between gap-3"><Label>{label}</Label>{hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}</div>{children}</div>;
}
