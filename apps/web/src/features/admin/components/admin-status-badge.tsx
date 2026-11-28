import { AlertTriangle, CheckCircle2, Clock, HelpCircle, MinusCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

export type AdminStatusTone = "success" | "warning" | "danger" | "neutral" | "info";

interface StatusPresentation {
  tone: AdminStatusTone;
  labelVi: string;
  labelEn: string;
}

const STATUS_MAP: Record<string, StatusPresentation> = {
  healthy: { tone: "success", labelVi: "Hoạt động tốt", labelEn: "Healthy" },
  active: { tone: "success", labelVi: "Đang hoạt động", labelEn: "Active" },
  alive: { tone: "success", labelVi: "Trực tuyến", labelEn: "Alive" },
  enabled: { tone: "success", labelVi: "Đang bật", labelEn: "Enabled" },
  succeeded: { tone: "success", labelVi: "Thành công", labelEn: "Succeeded" },
  completed: { tone: "success", labelVi: "Hoàn tất", labelEn: "Completed" },
  ready: { tone: "success", labelVi: "Sẵn sàng", labelEn: "Ready" },
  verified: { tone: "success", labelVi: "Đã xác minh", labelEn: "Verified" },
  validated: { tone: "success", labelVi: "Đã kiểm chứng", labelEn: "Validated" },
  pass: { tone: "success", labelVi: "Đạt", labelEn: "Pass" },

  running: { tone: "info", labelVi: "Đang chạy", labelEn: "Running" },
  generating: { tone: "info", labelVi: "Đang tạo", labelEn: "Generating" },
  analyzing: { tone: "info", labelVi: "Đang phân tích", labelEn: "Analyzing" },

  degraded: { tone: "warning", labelVi: "Suy giảm", labelEn: "Degraded" },
  stale: { tone: "warning", labelVi: "Quá hạn nhịp", labelEn: "Stale" },
  pending: { tone: "warning", labelVi: "Chờ xử lý", labelEn: "Pending" },
  queued: { tone: "warning", labelVi: "Đang xếp hàng", labelEn: "Queued" },
  suspended: { tone: "warning", labelVi: "Tạm khóa", labelEn: "Suspended" },
  needs_more_information: { tone: "warning", labelVi: "Cần bổ sung", labelEn: "Needs Info" },
  warn: { tone: "warning", labelVi: "Cảnh báo", labelEn: "Warning" },
  warning: { tone: "warning", labelVi: "Cảnh báo", labelEn: "Warning" },
  candidate: { tone: "warning", labelVi: "Đề xuất", labelEn: "Candidate" },

  unavailable: { tone: "danger", labelVi: "Không khả dụng", labelEn: "Unavailable" },
  down: { tone: "danger", labelVi: "Ngừng kết nối", labelEn: "Down" },
  missing: { tone: "danger", labelVi: "Mất nhịp", labelEn: "Missing" },
  failed: { tone: "danger", labelVi: "Thất bại", labelEn: "Failed" },
  fail: { tone: "danger", labelVi: "Không đạt", labelEn: "Fail" },
  disabled: { tone: "danger", labelVi: "Vô hiệu hóa", labelEn: "Disabled" },
  rejected: { tone: "danger", labelVi: "Từ chối", labelEn: "Rejected" },

  unknown: { tone: "neutral", labelVi: "Chưa xác định", labelEn: "Unknown" },
  not_configured: { tone: "neutral", labelVi: "Chưa cấu hình", labelEn: "Not configured" },
  idle: { tone: "neutral", labelVi: "Chờ", labelEn: "Idle" },
  inactive: { tone: "neutral", labelVi: "Ngừng hoạt động", labelEn: "Inactive" },
  cancelled: { tone: "neutral", labelVi: "Đã hủy", labelEn: "Cancelled" },
  self_declared: { tone: "neutral", labelVi: "Tự khai báo", labelEn: "Self-declared" },
  archived: { tone: "neutral", labelVi: "Lưu trữ", labelEn: "Archived" },
};

const TONE_CLASSES: Record<AdminStatusTone, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  neutral: "border-border bg-muted/60 text-muted-foreground",
};

export function resolveAdminStatusTone(status?: string | null): AdminStatusTone {
  const key = (status ?? "unknown").trim().toLowerCase();
  return STATUS_MAP[key]?.tone ?? "neutral";
}

export function AdminStatusBadge({
  status,
  label,
  className,
  showIcon = true,
}: {
  status?: string | null;
  label?: string;
  className?: string;
  showIcon?: boolean;
}) {
  const { language } = useI18n();
  const key = (status ?? "unknown").trim().toLowerCase();
  const entry = STATUS_MAP[key];
  const tone: AdminStatusTone = entry?.tone ?? "neutral";
  const text = label ?? (entry ? (language === "vi" ? entry.labelVi : entry.labelEn) : status || (language === "vi" ? "Chưa xác định" : "Unknown"));

  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "danger"
        ? XCircle
        : tone === "warning"
          ? AlertTriangle
          : tone === "info"
            ? Clock
            : key === "not_configured" || key === "disabled" || key === "inactive"
              ? MinusCircle
              : HelpCircle;

  return (
    <Badge
      variant="outline"
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE_CLASSES[tone], className)}
    >
      {showIcon ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
      <span>{text}</span>
    </Badge>
  );
}
