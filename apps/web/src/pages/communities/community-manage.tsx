import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Inbox, Shield, ShieldAlert, UserRoundCog, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ForumModerationQueue } from "@/features/forum/components/forum-moderation-queue";
import {
  type CommunityMemberView,
  type CommunityView,
  useCommunity,
  useCommunityMembers,
  useSetCommunityStatus,
  useTransferCommunityOwnership,
  useUpdateCommunity,
  useUpdateCommunityMember,
} from "@/features/forum";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

type Tab = "settings" | "requests" | "members" | "moderation";
type MemberChange = { role?: "moderator" | "member"; status?: "pending" | "active" | "declined" | "banned" };

const splitValues = (value: string) => [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
const requestError = (error: unknown, fallback: string) => (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");

export function CommunityManagePage() {
  const { t } = useI18n();
  const { slug = "" } = useParams();
  const { data: community, isLoading, error } = useCommunity(slug);
  const [tab, setTab] = useState<Tab>("requests");

  if (isLoading) return <main className="mx-auto max-w-5xl px-4 py-8"><div className="h-80 animate-pulse rounded-xl bg-muted" /></main>;
  if (error || !community) return <Unavailable message={t("Community unavailable.")} />;
  if (!community.canManage) return <Unavailable message={t("You do not have permission to manage this community.")} community={community} />;

  const pending = community.pendingRequestCount ?? 0;
  const tabs: Array<{ value: Tab; label: string; icon: typeof Shield; badge?: number }> = [
    ...(community.canEditCommunity ? [{ value: "settings" as const, label: "Settings and rules", icon: Shield }] : []),
    { value: "requests", label: "Join requests", icon: Inbox, badge: pending },
    { value: "members", label: "Members", icon: UserRoundCog },
    { value: "moderation", label: "Moderation", icon: ShieldAlert },
  ];

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <Link to={`/communities/${community.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-blue-700"><ArrowLeft className="h-4 w-4" />{t("Back to community")}</Link>
    <header className="mt-5 border-b pb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{t("Community management")}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{community.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("Manage membership, moderation, and community settings within your permission scope.")}</p>
    </header>
    <nav className="mt-5 flex gap-1 overflow-x-auto border-b" aria-label={t("Community management sections")}>
      {tabs.map(({ value, label, icon: Icon, badge }) => <button key={value} type="button" onClick={() => setTab(value)}
        className={cn("inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === value ? "border-blue-700 text-blue-700" : "border-transparent text-muted-foreground hover:text-foreground")}>
        <Icon className="h-4 w-4" />{t(label)}
        {badge ? <span className="rounded-full bg-blue-700 px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums">{badge}</span> : null}
      </button>)}
    </nav>
    <div className="mt-7">
      {tab === "settings" && community.canEditCommunity ? <Settings community={community} />
        : tab === "requests" ? <MemberList community={community} mode="requests" />
          : tab === "members" ? <MemberList community={community} mode="members" />
            : <ForumModerationQueue communityId={community.id} />}
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
  const [visibility, setVisibility] = useState(community.visibility);
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">(community.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE");
  const [topics, setTopics] = useState(community.researchTopics.join(", "));
  const [rules, setRules] = useState(community.rules.join("\n"));
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const canChangeStatus = community.isAdmin && (community.status === "ACTIVE" || community.status === "ARCHIVED");
  const busy = update.isPending || setStatusMutation.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    try {
      await update.mutateAsync({ id: community.id, input: { name: name.trim(), description: description.trim(), researchField: researchField.trim() || undefined, icon: icon.trim() || undefined, visibility, researchTopics: splitValues(topics), rules: splitValues(rules) } });
      if (canChangeStatus && status !== community.status) await setStatusMutation.mutateAsync({ id: community.id, status });
      setMessage({ text: t("Community settings saved.") });
    } catch (reason) {
      setMessage({ text: requestError(reason, t("Could not save community settings.")), error: true });
    }
  }

  return <section className="max-w-3xl">
    <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-blue-700" /><h2 className="text-lg font-semibold">{t("Settings and rules")}</h2></div>
    <p className="mt-1 text-sm text-muted-foreground">{t("Owners and administrators can edit this community. Only administrators can archive it.")}</p>
    <form onSubmit={submit} className="mt-5 space-y-5">
      <Field label={t("Community name")}><Input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
        <Field label={t("Research field")}><Input maxLength={160} value={researchField} onChange={(event) => setResearchField(event.target.value)} /></Field>
        <Field label={t("Icon key")}><Input maxLength={40} pattern="[A-Za-z0-9-]+" value={icon} onChange={(event) => setIcon(event.target.value)} /></Field>
      </div>
      <Field label={t("Description")}><textarea required maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></Field>
      <Field label={t("Research topics")} hint={t("Comma separated")}><Input value={topics} onChange={(event) => setTopics(event.target.value)} /></Field>
      <Field label={t("Community rules")} hint={t("One rule per line")}><textarea value={rules} onChange={(event) => setRules(event.target.value)} className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("Visibility")}>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "private")} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="public">{t("Public, anyone can read")}</option>
            <option value="private">{t("Private, approved members only")}</option>
          </select>
        </Field>
        {canChangeStatus ? <Field label={t("Status")}>
          <select value={status} onChange={(event) => setStatus(event.target.value as "ACTIVE" | "ARCHIVED")} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="ACTIVE">{t("Active")}</option>
            <option value="ARCHIVED">{t("Archived — read only")}</option>
          </select>
        </Field> : null}
      </div>
      {message ? <p role="status" className={`text-sm ${message.error ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p> : null}
      <Button type="submit" disabled={busy || name.trim().length < 2 || !description.trim()}>{t(busy ? "Saving…" : "Save settings")}</Button>
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

function MemberList({ community, mode }: { community: CommunityView; mode: "requests" | "members" }) {
  const { t } = useI18n();
  const members = useCommunityMembers(community.id, community.canManage);
  const update = useUpdateCommunityMember();
  const [error, setError] = useState("");
  const canAssignModerators = community.isOwner || community.isAdmin;
  const rows = useMemo(() => (members.data ?? []).filter((member) => (mode === "requests" ? member.status === "pending" : member.status !== "pending")), [members.data, mode]);

  async function change(userId: string, input: MemberChange) {
    setError("");
    try { await update.mutateAsync({ id: community.id, userId, input }); } catch (reason) { setError(requestError(reason, t("Could not update this member."))); }
  }

  const title = mode === "requests" ? "Join requests" : "Members";
  const hint = mode === "requests" ? "Approve or decline people asking to join this private community." : "Maintain community access and moderators.";
  return <section>
    <div className="flex items-center gap-2">{mode === "requests" ? <Inbox className="h-4 w-4 text-blue-700" /> : <UserRoundCog className="h-4 w-4 text-blue-700" />}<h2 className="text-lg font-semibold">{t(title)}</h2></div>
    <p className="mt-1 text-sm text-muted-foreground">{t(hint)}</p>
    {error ? <p role="alert" className="mt-4 text-sm text-red-600">{error}</p> : null}
    {members.isLoading ? <div className="mt-5 space-y-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
      : members.error ? <p className="mt-5 text-sm text-red-600">{t("Unable to load members.")}</p>
        : rows.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">{t(mode === "requests" ? "No pending join requests." : "No members yet.")}</p>
          : <div className="mt-5 divide-y border-y">{rows.map((member) => <MemberRow key={member.id} member={member} busy={update.isPending} canAssignModerators={canAssignModerators} onChange={change} />)}</div>}
  </section>;
}

function MemberRow({ member, busy, canAssignModerators, onChange }: { member: CommunityMemberView; busy: boolean; canAssignModerators: boolean; onChange: (userId: string, input: MemberChange) => void }) {
  const { t } = useI18n();
  const isOwner = member.role === "owner";
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
      </div>
    </div>
    {isOwner ? null : <div className="mt-3 flex flex-wrap gap-2 pl-12">
      {member.status === "pending" ? <>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onChange(member.user.id, { status: "active" })}><Check className="h-3.5 w-3.5" />{t("Approve")}</Button>
        <Button size="sm" variant="ghost" className="text-red-600" disabled={busy} onClick={() => onChange(member.user.id, { status: "declined" })}><X className="h-3.5 w-3.5" />{t("Decline")}</Button>
      </> : ["banned", "declined"].includes(member.status)
        ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onChange(member.user.id, { status: "active" })}>{t("Restore access")}</Button>
        : <Button size="sm" variant="ghost" className="text-red-600" disabled={busy} onClick={() => onChange(member.user.id, { status: "banned" })}>{t("Ban member")}</Button>}
      {canAssignModerators && member.status === "active" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onChange(member.user.id, { role: member.role === "moderator" ? "member" : "moderator" })}>{t(member.role === "moderator" ? "Remove moderator" : "Make moderator")}</Button> : null}
    </div>}
  </div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-2"><div className="flex items-end justify-between gap-3"><Label>{label}</Label>{hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}</div>{children}</div>;
}
