import { useDeferredValue, useEffect, useState, type FormEvent } from "react";
import type { AxiosError } from "axios";
import {
  isAdminSystemRole,
  type AccountStatus,
  type AdminUserDetail,
  type AdminUserItem,
  type SystemRole,
} from "@trend/shared-types";
import {
  Activity,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Clock3,
  Edit3,
  Eye,
  KeyRound,
  Laptop2,
  LockKeyhole,
  MailCheck,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAdminUser,
  useAdminUsers,
  useAdminUsersSummary,
  useCreateAdminUser,
  useRevokeUserSessions,
  useUpdateAdminUser,
  useUpdateUserRole,
  useUpdateUserStatus,
} from "@/features/admin";
import { authApi, useCurrentUser } from "@/features/auth";
import { combineAcademicBio } from "@/features/academic-profile/utils/academic-bio";
import { useI18n } from "@/i18n";

const ROLES: SystemRole[] = ["USER", "ADMIN"];
const STATUSES: AccountStatus[] = ["ACTIVE", "SUSPENDED", "DISABLED"];
const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function apiErr(err: unknown): string {
  const ax = err as AxiosError<{ error?: { message?: string } }>;
  return ax?.response?.data?.error?.message ?? "Action failed.";
}

function formatDate(value?: string): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function roleLabel(role: SystemRole): string {
  return role === "ADMIN" ? "Admin" : "User";
}

function statusLabel(status: AccountStatus): string {
  return status[0] + status.slice(1).toLowerCase();
}

function statusBadge(status: AccountStatus) {
  const config = {
    ACTIVE: {
      label: "Active",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    },
    SUSPENDED: {
      label: "Suspended",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    DISABLED: {
      label: "Disabled",
      className: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    },
  }[status];

  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}

type ActionState =
  | { kind: "role"; user: AdminUserItem; value: SystemRole }
  | { kind: "status"; user: AdminUserItem; value: AccountStatus }
  | { kind: "sessions"; user: AdminUserItem };

export function AdminUsersPage() {
  const { t } = useI18n();
  const { data: me } = useCurrentUser();
  const myRole = me?.user?.systemRole;
  const myId = me?.user?.id;
  const isAdmin = isAdminSystemRole(myRole);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [roleFilter, setRoleFilter] = useState<SystemRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [verificationFilter, setVerificationFilter] = useState<"all" | "verified" | "unverified">("all");
  const [sort, setSort] = useState<"createdAt" | "lastLoginAt" | "fullName" | "email">("createdAt");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [action, setAction] = useState<ActionState>();

  useEffect(() => setPage(1), [deferredSearch, roleFilter, statusFilter, verificationFilter, sort, pageSize]);

  const query = {
    page,
    pageSize,
    sortBy: sort,
    sortOrder: "desc" as const,
    ...(deferredSearch ? { search: deferredSearch } : {}),
    ...(roleFilter !== "all" ? { role: roleFilter } : {}),
    ...(statusFilter !== "all" ? { accountStatus: statusFilter } : {}),
    ...(verificationFilter !== "all" ? { emailVerified: verificationFilter === "verified" } : {}),
  };
  const { data, isLoading, isFetching } = useAdminUsers(query, isAdmin);
  const { data: summary, isLoading: summaryLoading } = useAdminUsersSummary(isAdmin);
  const updateRole = useUpdateUserRole();
  const updateStatus = useUpdateUserStatus();
  const revokeSessions = useRevokeUserSessions();

  if (!isAdmin) {
    return (
      <main className="space-y-3 py-16 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-rose-500/80" />
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p className="text-muted-foreground">Only admins can view this page.</p>
      </main>
    );
  }

  const submitAction = async (reason: string) => {
    if (!action) return;
    try {
      if (action.kind === "role") {
        await updateRole.mutateAsync({ id: action.user.id, role: action.value, reason });
        toast.success("Role updated successfully.");
      } else if (action.kind === "status") {
        await updateStatus.mutateAsync({ id: action.user.id, accountStatus: action.value, reason });
        toast.success(
          action.value === "ACTIVE"
            ? "Account reactivated."
            : action.value === "SUSPENDED"
              ? "Account suspended and active sessions revoked."
              : "Account disabled and active sessions revoked.",
        );
      } else {
        const result = await revokeSessions.mutateAsync({ id: action.user.id, reason });
        toast.success(`${result.revoked} active sessions revoked.`);
      }
      setAction(undefined);
    } catch (error) {
      toast.error(apiErr(error));
    }
  };

  const meta = data?.meta;
  const filtersActive =
    roleFilter !== "all" || statusFilter !== "all" || verificationFilter !== "all" || Boolean(search);

  return (
    <main className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage account access, roles, sessions, and user lifecycle from one place."
        actions={(
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Add user
          </Button>
        )}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="User account summary">
        <SummaryCard label="Total users" value={summary?.total} icon={Users} loading={summaryLoading} />
        <SummaryCard label="Active" value={summary?.active} icon={CheckCircle2} loading={summaryLoading} tone="emerald" />
        <SummaryCard label="Suspended" value={summary?.suspended} icon={LockKeyhole} loading={summaryLoading} tone="amber" />
        <SummaryCard label="Disabled" value={summary?.disabled} icon={CircleOff} loading={summaryLoading} tone="rose" />
        <SummaryCard label="Email unverified" value={summary?.unverifiedEmail} icon={MailCheck} loading={summaryLoading} />
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search users"
              placeholder={t("Search email or name…")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <select aria-label="Filter by role" className={SELECT_CLASS} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as SystemRole | "all")}>
            <option value="all">All roles</option>
            {ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
          <select aria-label="Filter by status" className={SELECT_CLASS} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AccountStatus | "all")}>
            <option value="all">All statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
          <select aria-label="Filter by email verification" className={SELECT_CLASS} value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value as typeof verificationFilter)}>
            <option value="all">All email states</option>
            <option value="verified">Email verified</option>
            <option value="unverified">Email unverified</option>
          </select>
          <select aria-label="Sort users" className={SELECT_CLASS} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="createdAt">Newest joined</option>
            <option value="lastLoginAt">Last login</option>
            <option value="fullName">Name</option>
            <option value="email">Email</option>
          </select>
          {filtersActive ? (
            <Button variant="ghost" size="sm" onClick={() => {
              setSearch("");
              setRoleFilter("all");
              setStatusFilter("all");
              setVerificationFilter("all");
            }}>
              Clear filters
            </Button>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[132px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array.from({ length: 7 }).map((_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: 7 }).map((__, cell) => <TableCell key={cell}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              )) : data?.data.length ? data.data.map((user) => (
                <TableRow key={user.id} className="cursor-pointer" onClick={() => setSelectedId(user.id)}>
                  <TableCell>
                    <div className="font-medium">{user.fullName}</div>
                    <div className="max-w-[260px] truncate text-xs text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell><div className="flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-muted-foreground" />{roleLabel(user.role)}</div></TableCell>
                  <TableCell>{statusBadge(user.accountStatus)}</TableCell>
                  <TableCell>{user.emailVerifiedAt ? <span className="text-emerald-700 dark:text-emerald-400">Verified</span> : <span className="text-muted-foreground">Unverified</span>}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(user.lastLoginAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" aria-label={`View details for ${user.fullName}`} onClick={(event) => {
                      event.stopPropagation();
                      setSelectedId(user.id);
                    }}>
                      <Eye className="h-4 w-4" />
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={7} className="py-14 text-center text-muted-foreground">No users match the current filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-muted-foreground">
            {meta ? `${meta.total} users · Page ${meta.page} of ${meta.totalPages}` : "Loading users…"}
            {isFetching && !isLoading ? " · Updating…" : ""}
          </div>
          <div className="flex items-center gap-2">
            <select aria-label="Rows per page" className={SELECT_CLASS} value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
            <Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" aria-label="Next page" disabled={!meta || page >= meta.totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </section>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <UserDetailSheet
        userId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(nextOpen) => { if (!nextOpen) setSelectedId(undefined); }}
        actorId={myId}
        actorRole={myRole}
        onAction={setAction}
      />
      <ActionDialog
        action={action}
        pending={updateRole.isPending || updateStatus.isPending || revokeSessions.isPending}
        onClose={() => setAction(undefined)}
        onSubmit={submitAction}
      />
    </main>
  );
}

function SummaryCard({ label, value, icon: Icon, loading, tone = "slate" }: {
  label: string;
  value?: number;
  icon: typeof Users;
  loading: boolean;
  tone?: "slate" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <div className={`rounded-lg p-2 ${tones[tone]}`}><Icon className="h-4 w-4" /></div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {loading ? <Skeleton className="mt-1 h-6 w-12" /> : <div className="text-xl font-semibold tabular-nums">{value ?? 0}</div>}
      </div>
    </div>
  );
}

function CreateUserDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createUser = useCreateAdminUser();
  const [sendInvite, setSendInvite] = useState(true);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const fullName = String(form.get("fullName") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const institution = String(form.get("institution") || "").trim() || undefined;

    // Secure initial password satisfying complexity requirements for the invited account
    const randomChars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const randomToken = Array.from(randomBytes, (b) => randomChars[b % randomChars.length]).join("");
    const password = `LumiGap#${randomToken}1Aa`;

    try {
      await createUser.mutateAsync({
        fullName,
        email,
        password,
        institution,
        role: "USER",
        accountStatus: "ACTIVE",
      });

      if (sendInvite) {
        await authApi.resendEmailVerification(email).catch(() => undefined);
        toast.success("User created and invitation email sent.");
      } else {
        toast.success("User created successfully.");
      }

      onOpenChange(false);
      formElement.reset();
      setSendInvite(true);
    } catch (error) {
      toast.error(apiErr(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="border-b pb-3 text-left">
          <DialogTitle className="text-lg font-semibold">Add user</DialogTitle>
        </DialogHeader>

        <DialogDescription className="text-sm text-muted-foreground">
          Create a LumiGap account. The user will receive an invitation to activate their account.
        </DialogDescription>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="create-user-fullname" className="text-sm font-medium">
              Full name <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-user-fullname"
              name="fullName"
              placeholder="Nguyễn Văn A"
              required
              maxLength={120}
              autoComplete="name"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="create-user-email" className="text-sm font-medium">
              Email <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-user-email"
              name="email"
              type="email"
              placeholder="nguyenvana@example.com"
              required
              maxLength={320}
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="create-user-institution" className="text-sm font-medium">
              Institution / organization
            </label>
            <Input
              id="create-user-institution"
              name="institution"
              placeholder="FPT University"
              maxLength={300}
              autoComplete="organization"
            />
            <p className="text-xs text-muted-foreground">Optional</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="create-user-role" className="text-sm font-medium">
              Account type
            </label>
            <div
              id="create-user-role"
              className="flex h-9 w-full items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-foreground"
            >
              Research user
            </div>
            <p className="text-xs text-muted-foreground">
              Admin access is granted only from an existing account through the audited role-change workflow.
            </p>
          </div>

          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-foreground select-none">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={(event) => setSendInvite(event.target.checked)}
                className="h-4 w-4 rounded border-input text-primary accent-primary focus:ring-2 focus:ring-ring"
              />
              <span>Send invitation email</span>
            </label>
          </div>

          <DialogFooter className="border-t pt-4 sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserDetailSheet({ userId, open, onOpenChange, actorId, actorRole, onAction }: {
  userId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorId?: string;
  actorRole?: SystemRole;
  onAction: (action: ActionState) => void;
}) {
  const { data: user, isLoading } = useAdminUser(userId);
  const updateUser = useUpdateAdminUser();
  const [editing, setEditing] = useState(false);
  const [nextRole, setNextRole] = useState<SystemRole>("USER");

  useEffect(() => setEditing(false), [userId]);
  useEffect(() => { if (user) setNextRole(user.role); }, [user]);

  const canManage = user ? user.id !== actorId && actorRole === "ADMIN" : false;
  const canEditIdentity = canManage && actorRole === "ADMIN";
  const academicBio = combineAcademicBio(user?.academicProfile?.headline, user?.academicProfile?.biography);

  const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    try {
      await updateUser.mutateAsync({
        id: user.id,
        input: {
          fullName: String(form.get("fullName")),
          email: String(form.get("email")),
          institution: String(form.get("institution") || "") || null,
        },
      });
      toast.success("User details updated.");
      setEditing(false);
    } catch (error) {
      toast.error(apiErr(error));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {isLoading || !user ? (
          <div className="space-y-5 p-6">
            <SheetTitle className="sr-only">User details</SheetTitle>
            <SheetDescription className="sr-only">Loading user account information.</SheetDescription>
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b px-6 py-5 pr-12">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {user.fullName.trim().charAt(0).toUpperCase() || "U"}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{user.fullName}</SheetTitle>
                  <SheetDescription className="mt-1 truncate">{user.email}</SheetDescription>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {statusBadge(user.accountStatus)}
                    <Badge variant="secondary">{roleLabel(user.role)}</Badge>
                    <Badge variant="outline">{user.emailVerifiedAt ? "Email verified" : "Email unverified"}</Badge>
                  </div>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="space-y-7 px-6 py-6">
                <AccountStatusSection user={user} canManage={canManage} onAction={onAction} />

                <section aria-labelledby="identity-heading" className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 id="identity-heading" className="text-sm font-semibold">Identity and account</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">Core identity and account lifecycle information.</p>
                    </div>
                    {canEditIdentity && !editing ? (
                      <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit3 className="h-3.5 w-3.5" />Edit</Button>
                    ) : null}
                  </div>

                  {editing ? (
                    <form className="space-y-3 rounded-lg border bg-muted/20 p-4" onSubmit={handleEdit}>
                      <label className="block space-y-1.5 text-sm"><span>Full name</span><Input name="fullName" defaultValue={user.fullName} required maxLength={120} /></label>
                      <label className="block space-y-1.5 text-sm">
                        <span>Email</span>
                        <Input name="email" type="email" defaultValue={user.email} required maxLength={320} />
                        <span className="block text-xs text-muted-foreground">Changing email clears verification and signs the user out.</span>
                      </label>
                      <label className="block space-y-1.5 text-sm"><span>Institution</span><Input name="institution" defaultValue={user.institution ?? ""} maxLength={300} /></label>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                        <Button type="submit" disabled={updateUser.isPending}>{updateUser.isPending ? "Saving…" : "Save changes"}</Button>
                      </div>
                    </form>
                  ) : (
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
                      <Detail label="Account ID" value={user.id} mono />
                      <Detail label="Institution" value={user.institution || "Not provided"} />
                      <Detail label="Joined" value={formatDate(user.createdAt)} />
                      <Detail label="Last updated" value={formatDate(user.updatedAt)} />
                      <Detail label="Last login" value={formatDate(user.lastLoginAt)} />
                      <Detail label="Onboarding" value={user.onboardingCompletedAt ? `Completed ${formatDate(user.onboardingCompletedAt)}` : "Not completed"} />
                    </dl>
                  )}
                </section>

                <section aria-labelledby="profile-heading" className="space-y-4">
                  <div>
                    <h3 id="profile-heading" className="text-sm font-semibold">Academic profile</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Affiliation, public profile, and verification state.</p>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
                    <Detail label="Position" value={user.academicProfile?.positionTitle || user.primaryPosition || "Not provided"} />
                    <Detail label="Department" value={user.academicProfile?.department || "Not provided"} />
                    <Detail label="Public handle" value={user.academicProfile?.publicHandle ? `@${user.academicProfile.publicHandle}` : "Not created"} />
                    <Detail label="Profile visibility" value={user.academicProfile?.profileVisibility || "Not configured"} />
                    <Detail label="Overall verification" value={user.academicProfile?.verificationStatus || "Not submitted"} />
                    <Detail label="Identity" value={user.academicProfile?.identityStatus || "Not submitted"} />
                    <Detail label="Affiliation" value={user.academicProfile?.affiliationStatus || "Not submitted"} />
                    <Detail label="Position verification" value={user.academicProfile?.positionStatus || "Not submitted"} />
                    <Detail label="ORCID" value={user.academicProfile?.orcidStatus || "Not submitted"} />
                    <Detail label="Institutional email" value={user.academicProfile?.institutionalEmail || "Not provided"} hint={user.academicProfile?.institutionalEmailVerifiedAt ? "Verified" : undefined} />
                  </dl>
                  {academicBio ? (
                    <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
                      <div className="text-xs text-muted-foreground">Academic Bio</div>
                      <p className="mt-1 whitespace-pre-wrap leading-6">{academicBio}</p>
                    </div>
                  ) : null}
                </section>

                <section aria-labelledby="access-heading" className="space-y-4">
                  <div>
                    <h3 id="access-heading" className="text-sm font-semibold">Access and security</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Role, sign-in methods, permissions, and active sessions.</p>
                  </div>

                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="min-w-0 flex-1 space-y-1.5 text-sm">
                        <span>System role</span>
                        <select className={`${SELECT_CLASS} w-full`} value={nextRole} onChange={(event) => setNextRole(event.target.value as SystemRole)} disabled={!canEditIdentity}>
                          {ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                        </select>
                      </label>
                      {canEditIdentity ? (
                        <Button variant="outline" disabled={nextRole === user.role} onClick={() => onAction({ kind: "role", user, value: nextRole })}>Change role</Button>
                      ) : null}
                    </div>
                    {!canEditIdentity ? <p className="text-xs text-muted-foreground">Only an existing admin can grant or revoke admin access. You also cannot change your own role.</p> : null}

                    <div>
                      <div className="text-xs text-muted-foreground">Sign-in methods</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {user.authenticationMethods.length ? user.authenticationMethods.map((method) => (
                          <Badge key={method} variant="outline">{method === "GOOGLE" ? "Google" : "Password"}</Badge>
                        )) : <span className="text-sm text-muted-foreground">No sign-in method recorded</span>}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-muted-foreground">Capabilities</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {user.capabilities.length ? user.capabilities.map((capability) => (
                          <Badge key={capability} variant="outline">{capability.replaceAll("_", " ")}</Badge>
                        )) : <span className="text-sm text-muted-foreground">No explicit capabilities</span>}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <CompactMetric label="Points" value={user.points} />
                      <CompactMetric label="Credits" value={user.credits} />
                      <CompactMetric label="Penalty" value={user.penaltyPoints} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium"><Laptop2 className="h-4 w-4 text-muted-foreground" />Active sessions ({user.activeSessions.length})</div>
                      {canManage && user.activeSessions.length ? (
                        <Button variant="outline" size="sm" onClick={() => onAction({ kind: "sessions", user })}><KeyRound className="h-3.5 w-3.5" />Revoke all</Button>
                      ) : null}
                    </div>
                    <div className="divide-y rounded-lg border">
                      {user.activeSessions.length ? user.activeSessions.map((session) => (
                        <div key={session.id} className="p-3 text-sm">
                          <div className="truncate font-medium">{session.userAgent || "Unknown device"}</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{session.ipAddress || "Unknown network"}</span>
                            <span>Last used {formatDate(session.lastUsedAt)}</span>
                            <span>Expires {formatDate(session.expiresAt)}</span>
                          </div>
                        </div>
                      )) : <div className="p-4 text-sm text-muted-foreground">No active sessions.</div>}
                    </div>
                  </div>
                </section>

                <section aria-labelledby="activity-heading" className="space-y-3">
                  <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /><h3 id="activity-heading" className="text-sm font-semibold">Recent administrative activity</h3></div>
                  <div className="divide-y rounded-lg border">
                    {user.recentActivity.length ? user.recentActivity.map((entry) => (
                      <div key={entry.id} className="flex items-start justify-between gap-4 p-3 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium">{entry.actionName.replaceAll(".", " ")}</div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">By {entry.user?.fullName || "System"}</div>
                        </div>
                        <time className="shrink-0 text-right text-xs text-muted-foreground">{formatDate(entry.createdAt)}</time>
                      </div>
                    )) : <div className="p-4 text-sm text-muted-foreground">No administrative activity recorded.</div>}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AccountStatusSection({ user, canManage, onAction }: {
  user: AdminUserDetail;
  canManage: boolean;
  onAction: (action: ActionState) => void;
}) {
  const descriptions: Record<AccountStatus, string> = {
    ACTIVE: "The user can sign in and use all access granted by their role.",
    SUSPENDED: "Sign-in is blocked temporarily and all existing sessions have been revoked.",
    DISABLED: "The account is deactivated and cannot sign in until it is reactivated.",
  };

  return (
    <section aria-labelledby="status-heading" className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-background p-2 text-muted-foreground shadow-sm ring-1 ring-border">
          {user.accountStatus === "ACTIVE" ? <BadgeCheck className="h-4 w-4 text-emerald-600" /> : <Ban className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 id="status-heading" className="text-sm font-semibold">Account status</h3>{statusBadge(user.accountStatus)}</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{descriptions[user.accountStatus]}</p>
        </div>
      </div>

      {user.statusReason ? (
        <div className="mt-3 rounded-md bg-background px-3 py-2 text-xs ring-1 ring-border">
          <span className="font-medium">Latest reason:</span> {user.statusReason}
          {user.statusChangedAt ? <div className="mt-1 text-muted-foreground">{formatDate(user.statusChangedAt)}{user.statusChangedBy ? ` by ${user.statusChangedBy.fullName}` : ""}</div> : null}
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {user.accountStatus !== "ACTIVE" ? <Button size="sm" onClick={() => onAction({ kind: "status", user, value: "ACTIVE" })}><RotateCcw className="h-3.5 w-3.5" />Reactivate</Button> : null}
          {user.accountStatus !== "SUSPENDED" ? <Button variant="outline" size="sm" onClick={() => onAction({ kind: "status", user, value: "SUSPENDED" })}><Clock3 className="h-3.5 w-3.5" />Suspend</Button> : null}
          {user.accountStatus !== "DISABLED" ? <Button variant="destructive" size="sm" onClick={() => onAction({ kind: "status", user, value: "DISABLED" })}><CircleOff className="h-3.5 w-3.5" />Disable account</Button> : null}
        </div>
      ) : <p className="mt-3 text-xs text-muted-foreground">This account is protected by the role hierarchy or is your own account.</p>}
    </section>
  );
}

function Detail({ label, value, hint, mono = false }: { label: string; value: string; hint?: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
      {hint ? <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">{hint}</div> : null}
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-muted/60 px-2 py-2"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-0.5 font-semibold tabular-nums">{value}</div></div>;
}

function ActionDialog({ action, pending, onClose, onSubmit }: {
  action?: ActionState;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [action]);
  if (!action) return null;

  const title = action.kind === "role"
    ? "Confirm role change"
    : action.kind === "sessions"
      ? "Revoke active sessions"
      : action.value === "ACTIVE"
        ? "Reactivate account"
        : action.value === "SUSPENDED"
          ? "Suspend account"
          : "Disable account";
  const description = action.kind === "role"
    ? `Change ${action.user.fullName} to ${roleLabel(action.value)}. Their active sessions will be revoked.`
    : action.kind === "sessions"
      ? `Sign ${action.user.fullName} out from every active device.`
      : action.value === "ACTIVE"
        ? `Restore sign-in access for ${action.user.fullName}.`
        : action.value === "SUSPENDED"
          ? `Temporarily block ${action.user.fullName} from signing in and revoke all active sessions.`
          : `Deactivate ${action.user.fullName} and revoke all active sessions.`;
  const destructive = action.kind === "sessions" || (action.kind === "status" && action.value !== "ACTIVE");

  return (
    <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description} This action is recorded in the audit log.</DialogDescription>
        </DialogHeader>
        <label className="space-y-1.5 text-sm">
          <span>Reason</span>
          <textarea
            className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Explain why this change is needed"
            autoFocus
          />
          <span className="block text-xs text-muted-foreground">Minimum 3 characters. Stored in the audit log.</span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={pending || reason.trim().length < 3} onClick={() => void onSubmit(reason.trim())}>
            {pending ? "Applying…" : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
