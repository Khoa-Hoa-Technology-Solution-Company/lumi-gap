import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Coins,
  Loader2,
  ReceiptText,
  RotateCcw,
  PlusCircle,
  ExternalLink,
} from "lucide-react";
import type { CreditAction, CreditTransactionType } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";
import { useCreditBalance, useCreditTransactions } from "../hooks/use-credits";
import { creditsApi } from "../api/credits.api";

const PAGE_SIZE = 10;

const ACTION_LABELS: Record<CreditAction, string> = {
  semantic_search: "Semantic search",
  trends_deterministic: "Trend analysis",
  search_rerank: "AI search rerank",
  fast_report: "Fast report",
  standard_report: "Standard report",
  deep_mcp_report: "Deep MCP report",
  generate_gaps: "Research gap analysis",
  generate_directions: "Research directions",
  project_chat_message: "Project AI chat",
  paper_request: "Paper request",
  paper_download: "Paper download",
  paper_upload_reward: "Paper upload reward",
  paper_review_system_key: "AI Paper Review (System Key)",
  paper_review_personal_key: "AI Paper Review (Personal Key)",
  paper_format_check: "Paper Format Check",
};

const FILTERS: Array<{ label: string; value: CreditTransactionType | "all" }> = [
  { label: "All", value: "all" },
  { label: "Charges", value: "charge" },
  { label: "Refunds", value: "refund" },
  { label: "Rewards", value: "reward" },
];

export function CreditHistory() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<CreditTransactionType | "all">("all");
  const { data: balance } = useCreditBalance();
  const history = useCreditTransactions({
    page,
    pageSize: PAGE_SIZE,
    type: type === "all" ? undefined : type,
  });

  useEffect(() => {
    setPage(1);
  }, [type]);

  const transactions = history.data?.data ?? [];
  const total = history.data?.meta.total ?? 0;
  const totalPages = Math.max(1, history.data?.meta.totalPages ?? 1);

  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const [amountVnd, setAmountVnd] = useState(20000);
  const [loadingPayos, setLoadingPayos] = useState(false);

  const handleTopup = async () => {
    setLoadingPayos(true);
    try {
      const res = await creditsApi.createPaymentLink(amountVnd);
      if (res.data?.checkoutUrl) {
        window.open(res.data.checkoutUrl, "_blank");
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "Không thể tạo link thanh toán PayOS");
    } finally {
      setLoadingPayos(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <ReceiptText className="h-5 w-5 text-blue-600" />
            Credit History
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review every AI charge, automatic refund, and earned reward.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => setIsTopupOpen(!isTopupOpen)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5"
          >
            <PlusCircle className="h-4 w-4" /> Nạp Credit (PayOS)
          </Button>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-right dark:border-blue-900/40 dark:bg-blue-950/20">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Available balance
            </p>
            <p className="mt-0.5 text-xl font-black text-blue-700 dark:text-blue-400">
              {formatNumber(balance?.credits ?? 0)} credits
            </p>
          </div>
        </div>
      </div>

      {isTopupOpen && (
        <div className="mb-6 p-5 rounded-2xl border border-indigo-100 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
            Nạp credit qua PayOS (Quét mã VietQR chuyển khoản)
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Tỷ lệ quy đổi: 100 VNĐ = 1 Credit. Nạp tối thiểu 10.000 VNĐ.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {[10000, 20000, 50000, 100000].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmountVnd(amt)}
                className={cn(
                  "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                  amountVnd === amt
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300",
                )}
              >
                {amt.toLocaleString("vi-VN")} đ ({amt / 100} credits)
              </button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={handleTopup}
            disabled={loadingPayos}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
          >
            {loadingPayos ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Mở trang thanh toán PayOS ({amountVnd.toLocaleString("vi-VN")} đ)
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setType(filter.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
              type === filter.value
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-zinc-900 dark:text-slate-300",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {history.isLoading ? (
        <div className="flex min-h-48 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading credit history...
        </div>
      ) : history.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          Credit history could not be loaded. Please try again.
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center dark:border-slate-800 dark:bg-zinc-900/20">
          <Coins className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-700" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">No credit transactions yet</p>
          <p className="mt-1 text-xs text-slate-500">
            AI report charges, refunds, and paper rewards will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.map((transaction, index) => {
                const isCharge = transaction.type === "charge";
                const isRefund = transaction.type === "refund";
                const amountPrefix = isCharge ? "-" : "+";

                return (
                  <div
                    key={`${transaction.id ?? transaction.createdAt}-${index}`}
                    className="flex flex-col gap-3 bg-white px-4 py-4 dark:bg-[#121212] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        isCharge
                          ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                          : isRefund
                            ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
                            : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
                      )}>
                        {isCharge
                          ? <ArrowUpRight className="h-4 w-4" />
                          : isRefund
                            ? <RotateCcw className="h-4 w-4" />
                            : <ArrowDownLeft className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {ACTION_LABELS[transaction.action] ?? transaction.action}
                          </p>
                          {transaction.status === "refunded" && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
                              Refunded
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {new Date(transaction.createdAt).toLocaleString()}
                          {transaction.targetKind ? ` · ${transaction.targetKind.replaceAll("_", " ")}` : ""}
                        </p>
                        {transaction.action === "paper_upload_reward" && transaction.metadata?.uploaderName && (
                          <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            Uploaded by: {transaction.metadata.uploaderName}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-6 pl-12 sm:justify-end sm:pl-0 sm:text-right">
                      <div>
                        <p className={cn(
                          "font-black",
                          isCharge
                            ? "text-red-600 dark:text-red-400"
                            : "text-emerald-600 dark:text-emerald-400",
                        )}>
                          {amountPrefix}{formatNumber(transaction.amount)} credits
                        </p>
                        {transaction.balanceAfter !== undefined && (
                          <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                            Balance: {formatNumber(transaction.balanceAfter)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{formatNumber(total)} transaction{total === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || history.isFetching}
                className="h-8 gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <span className="min-w-20 text-center font-semibold text-slate-600 dark:text-slate-300">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || history.isFetching}
                className="h-8 gap-1"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
