import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
  Building2,
  Globe,
  Lock,
  Pencil,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  isAdminSystemRole,
  type AdminApiProviderSettingItem,
  type AdminInstitutionSettingItem,
} from "@trend/shared-types";

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
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminEmptyPanel,
  AdminErrorPanel,
  AdminStatusBadge,
  adminApi,
} from "@/features/admin";
import { PlatformAiSettings } from "@/features/admin/components/platform-ai-settings";
import { PlatformEmbeddingSettings } from "@/features/admin/components/platform-embedding-settings";
import { useCurrentUser } from "@/features/auth";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

function extractError(error: unknown, fallback: string): string {
  const ax = error as AxiosError<{ error?: { message?: string } }>;
  return ax?.response?.data?.error?.message ?? fallback;
}

export function AdminSettingsPage() {
  const { language } = useI18n();
  const isVi = language === "vi";
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const viewerId = me?.user?.id ?? "anonymous";
  const isAdmin = isAdminSystemRole(me?.user?.systemRole);

  const {
    data: settings,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", viewerId, "settings"],
    queryFn: () => adminApi.getSettings(),
    enabled: isAdmin,
  });

  const [institutionTarget, setInstitutionTarget] = useState<AdminInstitutionSettingItem | null>(null);
  const [institutionReason, setInstitutionReason] = useState("");

  const [providerTarget, setProviderTarget] = useState<AdminApiProviderSettingItem | null>(null);
  const [providerRateLimit, setProviderRateLimit] = useState("");
  const [providerStatus, setProviderStatus] = useState<"enabled" | "disabled">("enabled");
  const [providerReason, setProviderReason] = useState("");

  const institutionMutation = useMutation({
    mutationFn: ({ id, isActive, reason }: { id: string; isActive: boolean; reason?: string }) =>
      adminApi.updateInstitution(id, { isActive, reason: reason || undefined }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", viewerId, "settings"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", viewerId, "audit-logs"] });
      toast.success(
        isVi
          ? `Đã ${updated.isActive ? "kích hoạt" : "tạm ngừng"} đơn vị ${updated.name}.`
          : `${updated.name} is now ${updated.isActive ? "active" : "inactive"}.`,
      );
      setInstitutionTarget(null);
      setInstitutionReason("");
    },
    onError: (err) => {
      toast.error(extractError(err, isVi ? "Không thể cập nhật trạng thái đơn vị." : "Failed to update institution status."));
    },
  });

  const providerMutation = useMutation({
    mutationFn: ({
      id,
      rateLimitPerMin,
      providerStatus: nextStatus,
      reason,
    }: {
      id: string;
      rateLimitPerMin: number;
      providerStatus: "enabled" | "disabled";
      reason?: string;
    }) =>
      adminApi.updateApiProvider(id, {
        rateLimitPerMin,
        providerStatus: nextStatus,
        reason: reason || undefined,
      }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", viewerId, "settings"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", viewerId, "audit-logs"] });
      toast.success(
        isVi
          ? `Đã lưu cấu hình ${updated.providerName} (${updated.rateLimitPerMin} req/phút · ${updated.providerStatus}).`
          : `Saved ${updated.providerName} (${updated.rateLimitPerMin} req/min · ${updated.providerStatus}).`,
      );
      setProviderTarget(null);
      setProviderReason("");
    },
    onError: (err) => {
      toast.error(extractError(err, isVi ? "Không thể cập nhật nhà cung cấp API." : "Failed to update API provider."));
    },
  });

  const openProviderEditor = (provider: AdminApiProviderSettingItem) => {
    setProviderTarget(provider);
    setProviderRateLimit(String(provider.rateLimitPerMin));
    setProviderStatus(provider.providerStatus === "disabled" ? "disabled" : "enabled");
    setProviderReason("");
  };

  const parsedRateLimit = Number(providerRateLimit);
  const rateLimitValid = Number.isInteger(parsedRateLimit) && parsedRateLimit >= 1 && parsedRateLimit <= 10000;

  return (
    <main className="max-w-5xl space-y-6">
      <PageHeader
        title={isVi ? "Cài đặt nền tảng & Chính sách" : "Platform Settings & Policies"}
        description={
          isVi
            ? "Quản trị kết nối AI/Embedding, danh sách tổ chức tin cậy và giới hạn nhà cung cấp API học thuật được lưu trực tiếp trong cơ sở dữ liệu có kiểm toán."
            : "Manage persisted AI/embedding connections, trusted academic institutions, and academic API provider limits with full audit logging."
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            {isVi ? "Làm mới" : "Refresh"}
          </Button>
        }
      />

      {/* Persisted AI & Embedding Provider Connections */}
      <PlatformAiSettings />
      <PlatformEmbeddingSettings />

      {isError ? (
        <AdminErrorPanel
          title={isVi ? "Không thể tải cấu hình nền tảng" : "Unable to load platform settings"}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      ) : (
        <>
          {/* Trusted Academic Institutions (Persisted & Editable) */}
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Building2 className="h-4 w-4 text-indigo-600" />
                {isVi ? "Tổ chức học thuật & tên miền tin cậy" : "Trusted Academic Institutions & Domains"}
              </h2>
              <span className="text-xs text-muted-foreground">
                {isVi ? "Điều kiện xác minh email tổ chức · Lưu trong PostgreSQL" : "Institutional verification eligibility · Persisted in PostgreSQL"}
              </span>
            </div>

            {isLoading ? (
              <div className="space-y-2.5">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : !settings?.institutions.length ? (
              <AdminEmptyPanel title={isVi ? "Chưa có tổ chức học thuật nào" : "No academic institutions configured"} />
            ) : (
              <div className="divide-y">
                {settings.institutions.map((inst) => (
                  <div key={inst.id} className="flex flex-col gap-2 py-3.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{inst.name}</span>
                        {inst.hostInstitution ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {isVi ? "Đơn vị chủ quản" : "Host"}
                          </Badge>
                        ) : null}
                        {inst.rorId ? (
                          <span className="font-mono text-[10px] text-muted-foreground">{inst.rorId}</span>
                        ) : null}
                      </div>
                      <p className="break-all font-mono text-[11px] text-muted-foreground">
                        {inst.domains.length > 0
                          ? `${isVi ? "Tên miền:" : "Domains:"} ${inst.domains.join(", ")}`
                          : isVi ? "Chưa khai báo tên miền" : "No domains registered"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <AdminStatusBadge status={inst.isActive ? "active" : "inactive"} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setInstitutionTarget(inst);
                          setInstitutionReason("");
                        }}
                      >
                        {inst.isActive ? (isVi ? "Tạm ngừng" : "Deactivate") : (isVi ? "Kích hoạt" : "Activate")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Configured Academic API Providers (Persisted & Editable) */}
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Globe className="h-4 w-4 text-emerald-600" />
                {isVi ? "Nhà cung cấp API học thuật" : "Configured Academic API Providers"}
              </h2>
              <span className="text-xs text-muted-foreground">
                {isVi ? "Cập nhật giới hạn tốc độ & trạng thái trực tiếp trong cơ sở dữ liệu" : "Persisted rate limits and provider status"}
              </span>
            </div>

            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !settings?.apiProviders.length ? (
              <AdminEmptyPanel title={isVi ? "Chưa có nhà cung cấp API học thuật nào" : "No academic API providers registered"} />
            ) : (
              <div className="divide-y">
                {settings.apiProviders.map((provider) => (
                  <div key={provider.id} className="flex flex-col gap-2 py-3.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold uppercase text-foreground">{provider.providerName}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {provider.providerKind}
                        </Badge>
                      </div>
                      <p className="break-all font-mono text-[11px] text-muted-foreground">{provider.baseUrl}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] font-medium tabular-nums">
                        {provider.rateLimitPerMin} req/min
                      </span>
                      <AdminStatusBadge status={provider.providerStatus} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => openProviderEditor(provider)}
                      >
                        <Pencil className="h-3 w-3" />
                        {isVi ? "Chỉnh sửa" : "Edit"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Environment-Controlled Runtime Policies (Honest Read-Only) */}
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Lock className="h-4 w-4 text-muted-foreground" />
                {isVi ? "Chính sách vận hành từ môi trường máy chủ (Chỉ đọc)" : "Environment-Controlled Runtime Policies (Read-Only)"}
              </h2>
              <Badge variant="outline" className="w-fit gap-1 text-[10px]">
                <ShieldCheck className="h-3 w-3" />
                {isVi ? "Biến .env · Cần khởi động lại để thay đổi" : ".env controlled · Restart required"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {isVi
                ? "Các thông số dưới đây được nạp trực tiếp từ cấu hình triển khai máy chủ và không thể sửa trực tiếp trên giao diện trình duyệt."
                : "These runtime parameters are loaded from server deployment configuration and cannot be mutated from the browser."}
            </p>

            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="divide-y rounded-lg border">
                {(settings?.environmentPolicies ?? []).map((policy) => (
                  <div key={policy.key} className="flex flex-col gap-1.5 p-3.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{policy.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{policy.key}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{policy.description}</p>
                    </div>
                    <div className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                      {String(policy.value)}
                      {policy.unit ? ` ${policy.unit}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Confirm Institution Status Dialog */}
      <Dialog open={Boolean(institutionTarget)} onOpenChange={(open) => { if (!open) setInstitutionTarget(null); }}>
        <DialogContent>
          {institutionTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {institutionTarget.isActive
                    ? isVi ? "Tạm ngừng tổ chức tin cậy" : "Deactivate trusted institution"
                    : isVi ? "Kích hoạt tổ chức tin cậy" : "Activate trusted institution"}
                </DialogTitle>
                <DialogDescription>
                  {isVi
                    ? `Thay đổi trạng thái của "${institutionTarget.name}" sẽ được lưu ngay trong cơ sở dữ liệu và ghi nhận vào Audit Log.`
                    : `Updating "${institutionTarget.name}" persists immediately to PostgreSQL and is recorded in the audit log.`}
                </DialogDescription>
              </DialogHeader>
              <label className="space-y-1.5 text-sm">
                <span>{isVi ? "Lý do (tùy chọn)" : "Reason (optional)"}</span>
                <Input
                  value={institutionReason}
                  onChange={(e) => setInstitutionReason(e.target.value)}
                  maxLength={500}
                  placeholder={isVi ? "Ghi chú cho nhật ký kiểm toán…" : "Note for audit log…"}
                />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInstitutionTarget(null)}>
                  {isVi ? "Hủy" : "Cancel"}
                </Button>
                <Button
                  type="button"
                  variant={institutionTarget.isActive ? "destructive" : "default"}
                  disabled={institutionMutation.isPending}
                  onClick={() =>
                    institutionMutation.mutate({
                      id: institutionTarget.id,
                      isActive: !institutionTarget.isActive,
                      reason: institutionReason.trim() || undefined,
                    })
                  }
                >
                  {institutionMutation.isPending
                    ? isVi ? "Đang lưu…" : "Saving…"
                    : institutionTarget.isActive
                      ? isVi ? "Xác nhận tạm ngừng" : "Confirm Deactivate"
                      : isVi ? "Xác nhận kích hoạt" : "Confirm Activate"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit API Provider Dialog */}
      <Dialog open={Boolean(providerTarget)} onOpenChange={(open) => { if (!open) setProviderTarget(null); }}>
        <DialogContent>
          {providerTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {isVi ? `Cấu hình ${providerTarget.providerName.toUpperCase()}` : `Configure ${providerTarget.providerName.toUpperCase()}`}
                </DialogTitle>
                <DialogDescription>
                  {isVi
                    ? "Thay đổi được lưu trực tiếp vào bảng api_providers và ghi vào nhật ký kiểm toán."
                    : "Changes persist to api_providers and are recorded in the audit log."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <label className="block space-y-1.5">
                  <span>{isVi ? "Giới hạn tốc độ (req/phút, 1–10.000)" : "Rate limit (req/min, 1–10,000)"}</span>
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    value={providerRateLimit}
                    onChange={(e) => setProviderRateLimit(e.target.value)}
                    className="font-mono"
                  />
                  {!rateLimitValid ? (
                    <span className="block text-xs text-destructive">
                      {isVi ? "Nhập số nguyên từ 1 đến 10.000." : "Enter an integer between 1 and 10,000."}
                    </span>
                  ) : null}
                </label>

                <label className="block space-y-1.5">
                  <span>{isVi ? "Trạng thái nhà cung cấp" : "Provider status"}</span>
                  <select
                    value={providerStatus}
                    onChange={(e) => setProviderStatus(e.target.value as "enabled" | "disabled")}
                    className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
                  >
                    <option value="enabled">{isVi ? "Đang bật (enabled)" : "Enabled"}</option>
                    <option value="disabled">{isVi ? "Đang tắt (disabled)" : "Disabled"}</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span>{isVi ? "Lý do (tùy chọn)" : "Reason (optional)"}</span>
                  <Input
                    value={providerReason}
                    onChange={(e) => setProviderReason(e.target.value)}
                    maxLength={500}
                    placeholder={isVi ? "Ghi chú cho nhật ký kiểm toán…" : "Note for audit log…"}
                  />
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setProviderTarget(null)}>
                  {isVi ? "Hủy" : "Cancel"}
                </Button>
                <Button
                  type="button"
                  disabled={providerMutation.isPending || !rateLimitValid}
                  onClick={() =>
                    providerMutation.mutate({
                      id: providerTarget.id,
                      rateLimitPerMin: parsedRateLimit,
                      providerStatus,
                      reason: providerReason.trim() || undefined,
                    })
                  }
                >
                  {providerMutation.isPending ? (isVi ? "Đang lưu…" : "Saving…") : isVi ? "Lưu thay đổi" : "Save changes"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
