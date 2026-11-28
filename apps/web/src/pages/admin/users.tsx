import { useDeferredValue, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { AxiosError } from "axios";
import {
  isAdminSystemRole,
  type AccountStatus,
  type AdminAcademicRole,
  type AdminUserDetail,
  type AdminUserItem,
  type AdminVerificationStatusFilter,
  type SystemRole,
} from "@trend/shared-types";
import {
  Activity,
  BadgeCheck,
  Ban,
  CheckCircle2,
  CircleOff,
  Clock3,
  Edit3,
  ExternalLink,
  Eye,
  GraduationCap,
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
  AdminEmptyPanel,
  AdminErrorPanel,
  AdminPaginationBar,
  AdminStatusBadge,
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
const ACADEMIC_ROLES: AdminAcademicRole[] = ["STUDENT", "LECTURER", "RESEARCHER"];
const VERIFICATION_STATUSES: AdminVerificationStatusFilter[] = [
  "PENDING",
  "NEEDS_MORE_INFORMATION",
  "VERIFIED",
  "SELF_DECLARED",
  "REJECTED",
];

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function apiErr(err: unknown, fallback: string): string {
  const ax = err as AxiosError<{ error?: { message?: string } }>;
  return ax?.response?.data?.error?.message ?? fallback;
}

function formatDate(value: string | undefined, isVi: boolean): string {
  if (!value) return isVi ? "Chưa có" : "Not yet";
  return new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function roleLabel(role: SystemRole, isVi: boolean): string {
  if (role === "ADMIN") return isVi ? "Quản trị viên" : "Admin";
  return isVi ? "Người dùng" : "User";
}

function academicRoleLabel(role: AdminAcademicRole | "UNSPECIFIED" | undefined, isVi: boolean): string {
  switch (role) {
    case "STUDENT":
      return isVi ? "Sinh viên" : "Student";
    case "LECTURER":
      return isVi ? "Giảng viên" : "Lecturer";
    case "RESEARCHER":
      return isVi ? "Nhà nghiên cứu" : "Researcher";
    default:
      return isVi ? "Chưa khai báo" : "Unspecified";
  }
}

type ActionState =
  | { kind: "role"; user: AdminUserItem; value: SystemRole }
  | { kind: "status"; user: AdminUserItem; value: AccountStatus }
  | { kind: "sessions"; user: AdminUserItem };

export function AdminUsersPage() {
  const { language } = useI18n();
  const isVi = language === "vi";
  const { data: me } = useCurrentUser();
  const myRole = me?.user?.systemRole;
  const myId = me?.user?.id;
  const isAdmin = isAdminSystemRole(myRole);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [institutionFilter, setInstitutionFilter] = useState("");
  const deferredInstitution = useDeferredValue(institutionFilter.trim());
  const [roleFilter, setRoleFilter] = useState<SystemRole | "all">("all");
  const [academicRoleFilter, setAcademicRoleFilter] = useState<AdminAcademicRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [verificationFilter, setVerificationFilter] = useState<AdminVerificationStatusFilter | "all">("all");
  const [emailFilter, setEmailFilter] = useState<"all" | "verified" | "unverified">("all");
  const [sort, setSort] = useState<"createdAt" | "lastLoginAt" | "fullName" | "email">("createdAt");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [action, setAction] = useState<ActionState>();

  useEffect(() => {
    setPage(1);
  }, [
    deferredSearch,
    deferredInstitution,
    roleFilter,
    academicRoleFilter,
    statusFilter,
    verificationFilter,
    emailFilter,
    sort,
    pageSize,
  ]);

  const query = {
    page,
    pageSize,
    sortBy: sort,
    sortOrder: "desc" as const,
    ...(deferredSearch ? { search: deferredSearch } : {}),
    ...(deferredInstitution ? { institution: deferredInstitution } : {}),
    ...(roleFilter !== "all" ? { role: roleFilter } : {}),
    ...(academicRoleFilter !== "all" ? { academicRole: academicRoleFilter } : {}),
    ...(statusFilter !== "all" ? { accountStatus: statusFilter } : {}),
    ...(verificationFilter !== "all" ? { verificationStatus: verificationFilter } : {}),
    ...(emailFilter !== "all" ? { emailVerified: emailFilter === "verified" } : {}),
  };

  const { data, isLoading, isFetching, isError, refetch } = useAdminUsers(query, isAdmin);
  const { data: summary, isLoading: summaryLoading } = useAdminUsersSummary(isAdmin);
  const updateRole = useUpdateUserRole();
  const updateStatus = useUpdateUserStatus();
  const revokeSessions = useRevokeUserSessions();

  if (!isAdmin) {
    return (
      <main className="space-y-3 py-16 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-rose-500/80" />
        <h1 className="text-2xl font-bold">{isVi ? "Không có quyền truy cập" : "Access denied"}</h1>
        <p className="text-muted-foreground">
          {isVi ? "Chỉ quản trị viên mới có thể xem trang này." : "Only admins can view this page."}
        </p>
      </main>
    );
  }

  const submitAction = async (reason: string) => {
    if (!action) return;
    try {
      if (action.kind === "role") {
        await updateRole.mutateAsync({ id: action.user.id, role: action.value, reason });
        toast.success(isVi ? "Đã cập nhật vai trò hệ thống và thu hồi phiên hiện tại." : "Role updated and active sessions revoked.");
      } else if (action.kind === "status") {
        await updateStatus.mutateAsync({ id: action.user.id, accountStatus: action.value, reason });
        toast.success(
          action.value === "ACTIVE"
            ? isVi ? "Đã kích hoạt lại tài khoản." : "Account reactivated."
            : action.value === "SUSPENDED"
              ? isVi ? "Đã tạm khóa tài khoản và thu hồi mọi phiên đăng nhập." : "Account suspended and active sessions revoked."
              : isVi ? "Đã vô hiệu hóa tài khoản và thu hồi mọi phiên đăng nhập." : "Account disabled and active sessions revoked.",
        );
      } else {
        const result = await revokeSessions.mutateAsync({ id: action.user.id, reason });
        toast.success(
          isVi
            ? `Đã thu hồi ${result.revoked} phiên đang hoạt động.`
            : `${result.revoked} active sessions revoked.`,
        );
      }
      setAction(undefined);
    } catch (error) {
      toast.error(apiErr(error, isVi ? "Thao tác thất bại." : "Action failed."));
    }
  };

  const meta = data?.meta;
  const filtersActive =
    roleFilter !== "all" ||
    academicRoleFilter !== "all" ||
    statusFilter !== "all" ||
    verificationFilter !== "all" ||
    emailFilter !== "all" ||
    Boolean(search) ||
    Boolean(institutionFilter);

  const clearFilters = () => {
    setSearch("");
    setInstitutionFilter("");
    setRoleFilter("all");
    setAcademicRoleFilter("all");
    setStatusFilter("all");
    setVerificationFilter("all");
    setEmailFilter("all");
  };

  return (
    <main className="space-y-6">
      <PageHeader
        title={isVi ? "Quản lý tài khoản người dùng" : "User Management"}
        description={
          isVi
            ? "Quản trị vai trò hệ thống, vai trò học thuật, trạng thái xác minh, phiên đăng nhập và vòng đời tài khoản."
            : "Manage system roles, academic roles, verification states, active sessions, and account lifecycle."
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/academic-verifications">
                <GraduationCap className="mr-1.5 h-4 w-4" />
                {isVi ? "Hàng đợi xác minh" : "Verification Queue"}
              </Link>
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              {isVi ? "Thêm người dùng" : "Add user"}
            </Button>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label={isVi ? "Tổng quan tài khoản" : "User account summary"}>
        <SummaryCard label={isVi ? "Tổng tài khoản" : "Total users"} value={summary?.total} icon={Users} loading={summaryLoading} />
        <SummaryCard label={isVi ? "Đang hoạt động" : "Active"} value={summary?.active} icon={CheckCircle2} loading={summaryLoading} tone="emerald" />
        <SummaryCard label={isVi ? "Tạm khóa" : "Suspended"} value={summary?.suspended} icon={LockKeyhole} loading={summaryLoading} tone="amber" />
        <SummaryCard label={isVi ? "Vô hiệu hóa" : "Disabled"} value={summary?.disabled} icon={CircleOff} loading={summaryLoading} tone="rose" />
        <SummaryCard label={isVi ? "Email chưa xác minh" : "Email unverified"} value={summary?.unverifiedEmail} icon={MailCheck} loading={summaryLoading} />
      </section>

      {summary?.byAcademicRole ? (
        <section className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-xs">
          <span className="font-semibold text-muted-foreground">
            {isVi ? "Phân bổ vai trò học thuật:" : "Academic role distribution:"}
          </span>
          {(["STUDENT", "LECTURER", "RESEARCHER", "UNSPECIFIED"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === "UNSPECIFIED") return;
                setAcademicRoleFilter((prev) => (prev === key ? "all" : key));
              }}
              disabled={key === "UNSPECIFIED"}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 transition-colors ${
                academicRoleFilter === key
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border bg-muted/40 text-foreground hover:bg-muted disabled:cursor-default disabled:hover:bg-muted/40"
              }`}
            >
              <span>{academicRoleLabel(key, isVi)}</span>
              <span className="font-mono font-semibold tabular-nums">{summary.byAcademicRole[key]}</span>
            </button>
          ))}
        </section>
      ) : null}

      <section className="rounded-xl border bg-card">
        <div className="space-y-3 border-b p-4">
          <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={isVi ? "Tìm theo tên hoặc email" : "Search users"}
                placeholder={isVi ? "Tìm theo tên, email hoặc đơn vị…" : "Search email, name, or institution…"}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 pl-9 text-xs"
              />
            </div>
            <Input
              aria-label={isVi ? "Lọc theo đơn vị" : "Filter by institution"}
              placeholder={isVi ? "Lọc theo trường / viện…" : "Filter by institution…"}
              value={institutionFilter}
              onChange={(event) => setInstitutionFilter(event.target.value)}
              className="h-9 text-xs"
            />
            <select
              aria-label={isVi ? "Sắp xếp người dùng" : "Sort users"}
              className={SELECT_CLASS}
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <option value="createdAt">{isVi ? "Mới tham gia" : "Newest joined"}</option>
              <option value="lastLoginAt">{isVi ? "Đăng nhập gần nhất" : "Last login"}</option>
              <option value="fullName">{isVi ? "Theo họ tên" : "Name"}</option>
              <option value="email">{isVi ? "Theo email" : "Email"}</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={isVi ? "Lọc vai trò hệ thống" : "Filter by role"}
              className={SELECT_CLASS}
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as SystemRole | "all")}
            >
              <option value="all">{isVi ? "Mọi vai trò hệ thống" : "All system roles"}</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role, isVi)}
                </option>
              ))}
            </select>

            <select
              aria-label={isVi ? "Lọc vai trò học thuật" : "Filter by academic role"}
              className={SELECT_CLASS}
              value={academicRoleFilter}
              onChange={(event) => setAcademicRoleFilter(event.target.value as AdminAcademicRole | "all")}
            >
              <option value="all">{isVi ? "Mọi vai trò học thuật" : "All academic roles"}</option>
              {ACADEMIC_ROLES.map((role) => (
                <option key={role} value={role}>
                  {academicRoleLabel(role, isVi)}
                </option>
              ))}
            </select>

            <select
              aria-label={isVi ? "Lọc trạng thái xác minh học thuật" : "Filter by academic verification"}
              className={SELECT_CLASS}
              value={verificationFilter}
              onChange={(event) => setVerificationFilter(event.target.value as AdminVerificationStatusFilter | "all")}
            >
              <option value="all">{isVi ? "Mọi trạng thái xác minh" : "All verification states"}</option>
              {VERIFICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>

            <select
              aria-label={isVi ? "Lọc trạng thái tài khoản" : "Filter by status"}
              className={SELECT_CLASS}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as AccountStatus | "all")}
            >
              <option value="all">{isVi ? "Mọi trạng thái tài khoản" : "All account statuses"}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <select
              aria-label={isVi ? "Lọc trạng thái email" : "Filter by email verification"}
              className={SELECT_CLASS}
              value={emailFilter}
              onChange={(event) => setEmailFilter(event.target.value as typeof emailFilter)}
            >
              <option value="all">{isVi ? "Mọi trạng thái email" : "All email states"}</option>
              <option value="verified">{isVi ? "Email đã xác minh" : "Email verified"}</option>
              <option value="unverified">{isVi ? "Email chưa xác minh" : "Email unverified"}</option>
            </select>

            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs">
                {isVi ? "Xóa bộ lọc" : "Clear filters"}
              </Button>
            ) : null}
          </div>
        </div>

        {isError ? (
          <div className="p-4">
            <AdminErrorPanel
              title={isVi ? "Không thể tải danh sách người dùng" : "Unable to load users"}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isVi ? "Người dùng" : "User"}</TableHead>
                    <TableHead>{isVi ? "Vai trò hệ thống" : "System Role"}</TableHead>
                    <TableHead>{isVi ? "Hồ sơ học thuật" : "Academic Profile"}</TableHead>
                    <TableHead>{isVi ? "Trạng thái" : "Account Status"}</TableHead>
                    <TableHead>{isVi ? "Email" : "Email"}</TableHead>
                    <TableHead>{isVi ? "Đăng nhập gần nhất" : "Last Login"}</TableHead>
                    <TableHead className="w-[110px] text-right">{isVi ? "Thao tác" : "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 7 }).map((_, row) => (
                      <TableRow key={row}>
                        {Array.from({ length: 7 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.data.length ? (
                    data.data.map((user) => (
                      <TableRow key={user.id} className="cursor-pointer" onClick={() => setSelectedId(user.id)}>
                        <TableCell>
                          <div className="font-medium text-foreground">{user.fullName}</div>
                          <div className="max-w-[240px] truncate text-xs text-muted-foreground">{user.email}</div>
                          {user.institution ? (
                            <div className="mt-0.5 max-w-[240px] truncate text-[11px] text-muted-foreground">
                              {user.institution}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{roleLabel(user.role, isVi)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-foreground">
                              {academicRoleLabel(user.academicRole, isVi)}
                            </div>
                            {user.verificationStatus ? (
                              <AdminStatusBadge status={user.verificationStatus} showIcon={false} />
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                {isVi ? "Chưa gửi hồ sơ" : "Not submitted"}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <AdminStatusBadge status={user.accountStatus} />
                        </TableCell>
                        <TableCell>
                          {user.emailVerifiedAt ? (
                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              {isVi ? "Đã xác minh" : "Verified"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {isVi ? "Chưa xác minh" : "Unverified"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(user.lastLoginAt, isVi)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${isVi ? "Xem chi tiết" : "View details for"} ${user.fullName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(user.id);
                            }}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            {isVi ? "Chi tiết" : "Details"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="p-6">
                        <AdminEmptyPanel
                          title={isVi ? "Không tìm thấy người dùng phù hợp" : "No users match the current filters"}
                          description={
                            filtersActive
                              ? isVi
                                ? "Hãy thử nới lỏng từ khóa hoặc xóa bộ lọc đang áp dụng."
                                : "Try broadening your query or clearing active filters."
                              : undefined
                          }
                          action={
                            filtersActive ? (
                              <Button variant="outline" size="sm" onClick={clearFilters}>
                                {isVi ? "Xóa bộ lọc" : "Clear filters"}
                              </Button>
                            ) : undefined
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <AdminPaginationBar
              page={meta?.page ?? page}
              totalPages={meta?.totalPages ?? 1}
              total={meta?.total ?? 0}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              isFetching={isFetching && !isLoading}
              noun={isVi ? "người dùng" : "users"}
            />
          </>
        )}
      </section>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} isVi={isVi} />
      <UserDetailSheet
        userId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedId(undefined);
        }}
        actorId={myId}
        actorRole={myRole}
        onAction={setAction}
        isVi={isVi}
      />
      <ActionDialog
        action={action}
        pending={updateRole.isPending || updateStatus.isPending || revokeSessions.isPending}
        onClose={() => setAction(undefined)}
        onSubmit={submitAction}
        isVi={isVi}
      />
    </main>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  loading,
  tone = "slate",
}: {
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
      <div className={`rounded-lg p-2 ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-12" />
        ) : (
          <div className="text-xl font-semibold tabular-nums">{value ?? "—"}</div>
        )}
      </div>
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  isVi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isVi: boolean;
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
        toast.success(isVi ? "Đã tạo tài khoản và gửi email kích hoạt." : "User created and invitation email sent.");
      } else {
        toast.success(isVi ? "Đã tạo tài khoản thành công." : "User created successfully.");
      }

      onOpenChange(false);
      formElement.reset();
      setSendInvite(true);
    } catch (error) {
      toast.error(apiErr(error, isVi ? "Không thể tạo tài khoản." : "Failed to create user."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="border-b pb-3 text-left">
          <DialogTitle className="text-lg font-semibold">
            {isVi ? "Thêm tài khoản người dùng" : "Add user"}
          </DialogTitle>
        </DialogHeader>

        <DialogDescription className="text-sm text-muted-foreground">
          {isVi
            ? "Tạo tài khoản LumiGap mới với vai trò người dùng nghiên cứu chuẩn. Quyền quản trị chỉ được cấp qua quy trình nâng quyền có kiểm toán."
            : "Create a LumiGap research account. Admin access can only be granted via the audited role-change workflow."}
        </DialogDescription>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="create-user-fullname" className="text-sm font-medium">
              {isVi ? "Họ và tên" : "Full name"} <span className="text-destructive">*</span>
            </label>
            <Input id="create-user-fullname" name="fullName" placeholder="Nguyễn Văn A" required maxLength={120} autoComplete="name" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="create-user-email" className="text-sm font-medium">
              Email <span className="text-destructive">*</span>
            </label>
            <Input id="create-user-email" name="email" type="email" placeholder="nguyenvana@example.edu.vn" required maxLength={320} autoComplete="email" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="create-user-institution" className="text-sm font-medium">
              {isVi ? "Trường / Viện / Đơn vị" : "Institution / organization"}
            </label>
            <Input id="create-user-institution" name="institution" placeholder="FPT University" maxLength={300} autoComplete="organization" />
          </div>

          <div className="pt-1">
            <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={(event) => setSendInvite(event.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span>{isVi ? "Gửi email xác minh / kích hoạt" : "Send invitation email"}</span>
            </label>
          </div>

          <DialogFooter className="gap-2 border-t pt-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isVi ? "Hủy" : "Cancel"}
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? (isVi ? "Đang tạo…" : "Creating…") : isVi ? "Tạo tài khoản" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserDetailSheet({
  userId,
  open,
  onOpenChange,
  actorId,
  actorRole,
  onAction,
  isVi,
}: {
  userId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorId?: string;
  actorRole?: SystemRole;
  onAction: (action: ActionState) => void;
  isVi: boolean;
}) {
  const { data: user, isLoading, isError, refetch } = useAdminUser(userId);
  const updateUser = useUpdateAdminUser();
  const [editing, setEditing] = useState(false);
  const [nextRole, setNextRole] = useState<SystemRole>("USER");

  useEffect(() => setEditing(false), [userId]);
  useEffect(() => {
    if (user) setNextRole(user.role);
  }, [user]);

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
      toast.success(isVi ? "Đã cập nhật thông tin tài khoản." : "User details updated.");
      setEditing(false);
    } catch (error) {
      toast.error(apiErr(error, isVi ? "Cập nhật thất bại." : "Failed to update user."));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {isLoading ? (
          <div className="space-y-5 p-6">
            <SheetTitle className="sr-only">{isVi ? "Chi tiết người dùng" : "User details"}</SheetTitle>
            <SheetDescription className="sr-only">{isVi ? "Đang tải hồ sơ tài khoản." : "Loading user account information."}</SheetDescription>
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError || !user ? (
          <div className="p-6">
            <SheetTitle className="sr-only">{isVi ? "Chi tiết người dùng" : "User details"}</SheetTitle>
            <SheetDescription className="sr-only">{isVi ? "Lỗi tải hồ sơ tài khoản." : "Error loading user details."}</SheetDescription>
            <AdminErrorPanel
              title={isVi ? "Không thể tải chi tiết người dùng" : "Unable to load user details"}
              onRetry={() => void refetch()}
            />
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
                    <AdminStatusBadge status={user.accountStatus} />
                    <Badge variant="secondary">{roleLabel(user.role, isVi)}</Badge>
                    {user.academicRole ? (
                      <Badge variant="outline">{academicRoleLabel(user.academicRole, isVi)}</Badge>
                    ) : null}
                    <Badge variant="outline">
                      {user.emailVerifiedAt
                        ? isVi ? "Email đã xác minh" : "Email verified"
                        : isVi ? "Email chưa xác minh" : "Email unverified"}
                    </Badge>
                  </div>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="space-y-7 px-6 py-6">
                <AccountStatusSection user={user} canManage={canManage} onAction={onAction} isVi={isVi} />

                <section aria-labelledby="identity-heading" className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 id="identity-heading" className="text-sm font-semibold">
                        {isVi ? "Định danh & tài khoản" : "Identity and account"}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {isVi ? "Thông tin định danh cốt lõi và vòng đời tài khoản." : "Core identity and account lifecycle information."}
                      </p>
                    </div>
                    {canEditIdentity && !editing ? (
                      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                        <Edit3 className="mr-1 h-3.5 w-3.5" />
                        {isVi ? "Chỉnh sửa" : "Edit"}
                      </Button>
                    ) : null}
                  </div>

                  {editing ? (
                    <form className="space-y-3 rounded-lg border bg-muted/20 p-4" onSubmit={handleEdit}>
                      <label className="block space-y-1.5 text-sm">
                        <span>{isVi ? "Họ và tên" : "Full name"}</span>
                        <Input name="fullName" defaultValue={user.fullName} required maxLength={120} />
                      </label>
                      <label className="block space-y-1.5 text-sm">
                        <span>Email</span>
                        <Input name="email" type="email" defaultValue={user.email} required maxLength={320} />
                        <span className="block text-xs text-muted-foreground">
                          {isVi
                            ? "Đổi email sẽ đặt lại trạng thái xác minh và đăng xuất người dùng."
                            : "Changing email clears verification and signs the user out."}
                        </span>
                      </label>
                      <label className="block space-y-1.5 text-sm">
                        <span>{isVi ? "Đơn vị" : "Institution"}</span>
                        <Input name="institution" defaultValue={user.institution ?? ""} maxLength={300} />
                      </label>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                          {isVi ? "Hủy" : "Cancel"}
                        </Button>
                        <Button type="submit" disabled={updateUser.isPending}>
                          {updateUser.isPending ? (isVi ? "Đang lưu…" : "Saving…") : isVi ? "Lưu thay đổi" : "Save changes"}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
                      <Detail label={isVi ? "Mã tài khoản" : "Account ID"} value={user.id} mono />
                      <Detail label={isVi ? "Đơn vị" : "Institution"} value={user.institution || (isVi ? "Chưa cung cấp" : "Not provided")} />
                      <Detail label={isVi ? "Ngày tham gia" : "Joined"} value={formatDate(user.createdAt, isVi)} />
                      <Detail label={isVi ? "Cập nhật gần nhất" : "Last updated"} value={formatDate(user.updatedAt, isVi)} />
                      <Detail label={isVi ? "Đăng nhập gần nhất" : "Last login"} value={formatDate(user.lastLoginAt, isVi)} />
                      <Detail
                        label="Onboarding"
                        value={
                          user.onboardingCompletedAt
                            ? `${isVi ? "Hoàn tất" : "Completed"} ${formatDate(user.onboardingCompletedAt, isVi)}`
                            : isVi ? "Chưa hoàn tất" : "Not completed"
                        }
                      />
                    </dl>
                  )}
                </section>

                <section aria-labelledby="profile-heading" className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 id="profile-heading" className="text-sm font-semibold">
                        {isVi ? "Hồ sơ học thuật & xác minh" : "Academic profile & verification"}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {isVi ? "Liên kết từ hệ thống Academic Profile chính thống." : "Linked from the canonical Academic Profile system."}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
                      <Link to="/admin/academic-verifications">
                        {isVi ? "Mở hàng đợi xác minh" : "Open verification queue"}
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
                    <Detail label={isVi ? "Vai trò học thuật" : "Academic role"} value={academicRoleLabel(user.academicProfile?.academicRole ?? user.academicRole, isVi)} />
                    <Detail label={isVi ? "Chức danh" : "Position"} value={user.academicProfile?.positionTitle || user.primaryPosition || (isVi ? "Chưa cung cấp" : "Not provided")} />
                    <Detail label={isVi ? "Khoa / Bộ môn" : "Department"} value={user.academicProfile?.department || (isVi ? "Chưa cung cấp" : "Not provided")} />
                    <Detail label={isVi ? "Handle công khai" : "Public handle"} value={user.academicProfile?.publicHandle ? `@${user.academicProfile.publicHandle}` : (isVi ? "Chưa tạo" : "Not created")} />
                    <Detail label={isVi ? "Trạng thái xác minh chung" : "Overall verification"} value={user.academicProfile?.verificationStatus || (isVi ? "Chưa gửi" : "Not submitted")} />
                    <Detail label={isVi ? "Xác minh đơn vị" : "Affiliation"} value={user.academicProfile?.affiliationStatus || (isVi ? "Chưa gửi" : "Not submitted")} />
                    <Detail label={isVi ? "Xác minh chức danh" : "Position verification"} value={user.academicProfile?.positionStatus || (isVi ? "Chưa gửi" : "Not submitted")} />
                    <Detail
                      label={isVi ? "Email tổ chức" : "Institutional email"}
                      value={user.academicProfile?.institutionalEmail || (isVi ? "Chưa cung cấp" : "Not provided")}
                      hint={user.academicProfile?.institutionalEmailVerifiedAt ? (isVi ? "Đã xác minh" : "Verified") : undefined}
                    />
                  </dl>
                  {academicBio ? (
                    <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
                      <div className="text-xs text-muted-foreground">{isVi ? "Tiểu sử học thuật" : "Academic Bio"}</div>
                      <p className="mt-1 whitespace-pre-wrap leading-6">{academicBio}</p>
                    </div>
                  ) : null}
                </section>

                {user.researchActivity ? (
                  <section aria-labelledby="research-activity-heading" className="space-y-3">
                    <div>
                      <h3 id="research-activity-heading" className="text-sm font-semibold">
                        {isVi ? "Tóm tắt hoạt động nghiên cứu (chỉ siêu dữ liệu)" : "Research activity summary (metadata only)"}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {isVi
                          ? "Chỉ hiển thị số lượng tổng hợp cho mục đích vận hành; không truy cập bản thảo, dữ liệu hay trao đổi nội bộ."
                          : "Operational aggregate counts only; private manuscripts, datasets, and project discussions are never exposed."}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                      <CompactMetric label={isVi ? "Dự án làm trưởng nhóm" : "Owned projects"} value={user.researchActivity.ownedProjects} />
                      <CompactMetric label={isVi ? "Dự án tham gia" : "Member projects"} value={user.researchActivity.memberProjects} />
                      <CompactMetric label={isVi ? "Hướng dẫn đang mở" : "Active mentorships"} value={user.researchActivity.activeMentorships} />
                      <CompactMetric label={isVi ? "Phân công phản biện" : "Review assignments"} value={user.researchActivity.reviewAssignments} />
                      <CompactMetric label={isVi ? "Lượt chạy AI" : "AI runs"} value={user.researchActivity.aiRuns} />
                      <CompactMetric label={isVi ? "Lượt AI lỗi" : "Failed AI runs"} value={user.researchActivity.failedAiRuns} />
                    </div>
                  </section>
                ) : null}

                <section aria-labelledby="access-heading" className="space-y-4">
                  <div>
                    <h3 id="access-heading" className="text-sm font-semibold">
                      {isVi ? "Quyền truy cập & bảo mật" : "Access and security"}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {isVi ? "Vai trò hệ thống, phương thức đăng nhập và các phiên đang hoạt động." : "Role, sign-in methods, permissions, and active sessions."}
                    </p>
                  </div>

                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="min-w-0 flex-1 space-y-1.5 text-sm">
                        <span>{isVi ? "Vai trò hệ thống" : "System role"}</span>
                        <select
                          className={`${SELECT_CLASS} w-full`}
                          value={nextRole}
                          onChange={(event) => setNextRole(event.target.value as SystemRole)}
                          disabled={!canEditIdentity}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role, isVi)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {canEditIdentity ? (
                        <Button variant="outline" disabled={nextRole === user.role} onClick={() => onAction({ kind: "role", user, value: nextRole })}>
                          {isVi ? "Đổi vai trò" : "Change role"}
                        </Button>
                      ) : null}
                    </div>
                    {!canEditIdentity ? (
                      <p className="text-xs text-muted-foreground">
                        {isVi
                          ? "Không thể tự thay đổi vai trò của chính mình hoặc tài khoản được bảo vệ."
                          : "You cannot change your own role or a protected account."}
                      </p>
                    ) : null}

                    <div>
                      <div className="text-xs text-muted-foreground">{isVi ? "Phương thức đăng nhập" : "Sign-in methods"}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {user.authenticationMethods.length ? (
                          user.authenticationMethods.map((method) => (
                            <Badge key={method} variant="outline">
                              {method === "GOOGLE" ? "Google" : isVi ? "Mật khẩu" : "Password"}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">{isVi ? "Chưa ghi nhận" : "No sign-in method recorded"}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <CompactMetric label={isVi ? "Điểm" : "Points"} value={user.points} />
                      <CompactMetric label="Credits" value={user.credits} />
                      <CompactMetric label={isVi ? "Điểm phạt" : "Penalty"} value={user.penaltyPoints} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Laptop2 className="h-4 w-4 text-muted-foreground" />
                        {isVi ? `Phiên đăng nhập (${user.activeSessions.length})` : `Active sessions (${user.activeSessions.length})`}
                      </div>
                      {canManage && user.activeSessions.length ? (
                        <Button variant="outline" size="sm" onClick={() => onAction({ kind: "sessions", user })}>
                          <KeyRound className="mr-1 h-3.5 w-3.5" />
                          {isVi ? "Thu hồi tất cả" : "Revoke all"}
                        </Button>
                      ) : null}
                    </div>
                    <div className="divide-y rounded-lg border">
                      {user.activeSessions.length ? (
                        user.activeSessions.map((session) => (
                          <div key={session.id} className="p-3 text-sm">
                            <div className="truncate font-medium">{session.userAgent || (isVi ? "Thiết bị không xác định" : "Unknown device")}</div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>{session.ipAddress || (isVi ? "Mạng không xác định" : "Unknown network")}</span>
                              <span>{isVi ? "Dùng gần nhất:" : "Last used"} {formatDate(session.lastUsedAt, isVi)}</span>
                              <span>{isVi ? "Hết hạn:" : "Expires"} {formatDate(session.expiresAt, isVi)}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-sm text-muted-foreground">
                          {isVi ? "Không có phiên đăng nhập nào đang mở." : "No active sessions."}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section aria-labelledby="activity-heading" className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <h3 id="activity-heading" className="text-sm font-semibold">
                      {isVi ? "Nhật ký quản trị gần đây" : "Recent administrative activity"}
                    </h3>
                  </div>
                  <div className="divide-y rounded-lg border">
                    {user.recentActivity.length ? (
                      user.recentActivity.map((entry) => (
                        <div key={entry.id} className="flex items-start justify-between gap-4 p-3 text-sm">
                          <div className="min-w-0">
                            <div className="font-mono text-xs font-medium">{entry.actionName}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {isVi ? "Bởi" : "By"} {entry.user?.fullName || (isVi ? "Hệ thống" : "System")}
                            </div>
                          </div>
                          <time className="shrink-0 text-right text-xs text-muted-foreground">
                            {formatDate(entry.createdAt, isVi)}
                          </time>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-sm text-muted-foreground">
                        {isVi ? "Chưa có nhật ký quản trị nào." : "No administrative activity recorded."}
                      </div>
                    )}
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

function AccountStatusSection({
  user,
  canManage,
  onAction,
  isVi,
}: {
  user: AdminUserDetail;
  canManage: boolean;
  onAction: (action: ActionState) => void;
  isVi: boolean;
}) {
  const descriptions: Record<AccountStatus, string> = isVi
    ? {
        ACTIVE: "Người dùng có thể đăng nhập và sử dụng quyền truy cập theo vai trò.",
        SUSPENDED: "Tạm chặn đăng nhập và đã thu hồi toàn bộ phiên đang hoạt động.",
        DISABLED: "Tài khoản bị vô hiệu hóa vĩnh viễn cho tới khi được kích hoạt lại.",
      }
    : {
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
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="status-heading" className="text-sm font-semibold">
              {isVi ? "Trạng thái tài khoản" : "Account status"}
            </h3>
            <AdminStatusBadge status={user.accountStatus} />
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{descriptions[user.accountStatus]}</p>
        </div>
      </div>

      {user.statusReason ? (
        <div className="mt-3 rounded-md bg-background px-3 py-2 text-xs ring-1 ring-border">
          <span className="font-medium">{isVi ? "Lý do gần nhất:" : "Latest reason:"}</span> {user.statusReason}
          {user.statusChangedAt ? (
            <div className="mt-1 text-muted-foreground">
              {formatDate(user.statusChangedAt, isVi)}
              {user.statusChangedBy ? ` · ${user.statusChangedBy.fullName}` : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {user.accountStatus !== "ACTIVE" ? (
            <Button size="sm" onClick={() => onAction({ kind: "status", user, value: "ACTIVE" })}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              {isVi ? "Kích hoạt lại" : "Reactivate"}
            </Button>
          ) : null}
          {user.accountStatus !== "SUSPENDED" ? (
            <Button variant="outline" size="sm" onClick={() => onAction({ kind: "status", user, value: "SUSPENDED" })}>
              <Clock3 className="mr-1 h-3.5 w-3.5" />
              {isVi ? "Tạm khóa" : "Suspend"}
            </Button>
          ) : null}
          {user.accountStatus !== "DISABLED" ? (
            <Button variant="destructive" size="sm" onClick={() => onAction({ kind: "status", user, value: "DISABLED" })}>
              <CircleOff className="mr-1 h-3.5 w-3.5" />
              {isVi ? "Vô hiệu hóa" : "Disable account"}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {isVi ? "Tài khoản này là chính bạn hoặc được bảo vệ bởi phân cấp quyền." : "This account is protected by role hierarchy or is your own account."}
        </p>
      )}
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
  return (
    <div className="rounded-md bg-muted/60 px-2 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ActionDialog({
  action,
  pending,
  onClose,
  onSubmit,
  isVi,
}: {
  action?: ActionState;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  isVi: boolean;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [action]);
  if (!action) return null;

  const title =
    action.kind === "role"
      ? isVi ? "Xác nhận thay đổi vai trò" : "Confirm role change"
      : action.kind === "sessions"
        ? isVi ? "Thu hồi toàn bộ phiên đăng nhập" : "Revoke active sessions"
        : action.value === "ACTIVE"
          ? isVi ? "Kích hoạt lại tài khoản" : "Reactivate account"
          : action.value === "SUSPENDED"
            ? isVi ? "Tạm khóa tài khoản" : "Suspend account"
            : isVi ? "Vô hiệu hóa tài khoản" : "Disable account";

  const description =
    action.kind === "role"
      ? isVi
        ? `Chuyển ${action.user.fullName} sang ${roleLabel(action.value, true)}. Các phiên đang mở sẽ bị thu hồi ngay lập tức.`
        : `Change ${action.user.fullName} to ${roleLabel(action.value, false)}. Active sessions will be revoked immediately.`
      : action.kind === "sessions"
        ? isVi
          ? `Đăng xuất ${action.user.fullName} khỏi mọi thiết bị đang hoạt động.`
          : `Sign ${action.user.fullName} out from every active device.`
        : action.value === "ACTIVE"
          ? isVi
            ? `Khôi phục quyền đăng nhập cho ${action.user.fullName}.`
            : `Restore sign-in access for ${action.user.fullName}.`
          : action.value === "SUSPENDED"
            ? isVi
              ? `Tạm chặn ${action.user.fullName} đăng nhập và thu hồi mọi phiên hiện có.`
              : `Temporarily block ${action.user.fullName} from signing in and revoke all active sessions.`
            : isVi
              ? `Vô hiệu hóa ${action.user.fullName} và thu hồi mọi phiên hiện có.`
              : `Deactivate ${action.user.fullName} and revoke all active sessions.`;

  const destructive = action.kind === "sessions" || (action.kind === "status" && action.value !== "ACTIVE");

  return (
    <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description} {isVi ? "Thao tác này được lưu trong nhật ký kiểm toán." : "This action is recorded in the audit log."}
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-1.5 text-sm">
          <span>{isVi ? "Lý do thực hiện" : "Reason"}</span>
          <textarea
            className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder={isVi ? "Nêu rõ lý do thay đổi…" : "Explain why this change is needed"}
            autoFocus
          />
          <span className="block text-xs text-muted-foreground">
            {isVi ? "Tối thiểu 3 ký tự. Được lưu trong Audit Log." : "Minimum 3 characters. Stored in the audit log."}
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {isVi ? "Hủy" : "Cancel"}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || reason.trim().length < 3}
            onClick={() => void onSubmit(reason.trim())}
          >
            {pending ? (isVi ? "Đang áp dụng…" : "Applying…") : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
