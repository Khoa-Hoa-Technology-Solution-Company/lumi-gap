import { useState } from "react";
import { toast } from "sonner";
import type { AxiosError } from "axios";
import type { UserRole } from "@trend/shared-types";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/features/auth";
import { useAdminUsers, useUpdateUserRole, useUpdateUserStatus } from "@/features/admin";
import { Lock, Unlock, ShieldAlert } from "lucide-react";
import { useI18n } from "@/i18n";

const ROLES: UserRole[] = ["student", "lecturer", "researcher", "admin"];

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function apiErr(err: unknown): string {
  const ax = err as AxiosError<{ error?: { message?: string } }>;
  return ax?.response?.data?.error?.message ?? "Action failed.";
}

export function AdminUsersPage() {
  const { t } = useI18n();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.user?.role === "admin";
  const myId = me?.user?.id;

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [page, setPage] = useState(1);

  const query = {
    page,
    pageSize: 20,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(roleFilter !== "all" ? { role: roleFilter } : {}),
  };
  const { data, isLoading } = useAdminUsers(query, isAdmin);
  const updateRole = useUpdateUserRole();
  const updateStatus = useUpdateUserStatus();

  if (!isAdmin) {
    return (
      <main className="space-y-3 py-16 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-red-500/80" />
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p className="text-muted-foreground">Only admins can view this page.</p>
      </main>
    );
  }

  const handleRole = (id: string, role: UserRole) =>
    updateRole.mutate(
      { id, role },
      {
        onSuccess: () => toast.success("Role updated successfully."),
        onError: (e) => toast.error(apiErr(e)),
      },
    );

  const handleStatus = (id: string, isActive: boolean) =>
    updateStatus.mutate(
      { id, isActive },
      {
        onSuccess: () => toast.success(isActive ? "User unlocked." : "User locked."),
        onError: (e) => toast.error(apiErr(e)),
      },
    );

  const meta = data?.meta;

  return (
    <main className="space-y-6">
      <PageHeader title="User Management" description="Manage user roles and accounts." />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={t("Search email or name…")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <select
          className={SELECT_CLASS}
          data-no-i18n
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as UserRole | "all");
            setPage(1);
          }}
        >
          <option value="all">{t("All roles")}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data && data.data.length > 0 ? (
              data.data.map((u) => {
                const isSelf = u.id === myId;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>{u.fullName}</TableCell>
                    <TableCell>
                      <select
                        className={SELECT_CLASS}
                        data-no-i18n
                        value={u.role}
                        disabled={isSelf || updateRole.isPending}
                        onChange={(e) => handleRole(u.id, e.target.value as UserRole)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "outline" : "destructive"}>
                        {u.isActive ? "Active" : "Locked"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSelf || updateStatus.isPending}
                        onClick={() => handleStatus(u.id, !u.isActive)}
                      >
                        {u.isActive ? (
                          <>
                            <Lock className="mr-1 h-4 w-4" />
                            Lock
                          </>
                        ) : (
                          <>
                            <Unlock className="mr-1 h-4 w-4" />
                            Unlock
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {meta.page} of {meta.totalPages} · {meta.total} users
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
