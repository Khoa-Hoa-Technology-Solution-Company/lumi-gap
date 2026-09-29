import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Coins,
  ExternalLink,
  Gift,
  Loader2,
  PlusCircle,
  ReceiptText,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import type { CreditAction, CreditTransactionType, PaymentOrderStatus } from "@trend/shared-types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";
import { useCreditSummary, useCreditTransactions, usePaymentOrders } from "../hooks/use-credits";
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
  credit_topup: "Credit top-up",
  paper_upload_reward: "Paper upload reward",
  paper_review_system_key: "AI Paper Review (System Key)",
  paper_review_personal_key: "AI Paper Review (Personal Key)",
  paper_format_check: "Paper Format Check",
};

const FILTERS: Array<{ label: string; value: CreditTransactionType | "all" }> = [
  { label: "All activity", value: "all" },
  { label: "Spent", value: "charge" },
  { label: "Refunds", value: "refund" },
  { label: "Added", value: "reward" },
];

const ORDER_STYLES: Record<PaymentOrderStatus, string> = {
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  cancelled: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300",
  expired: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
};

export function CreditHistory() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [type, setType] = useState<CreditTransactionType | "all">("all");
  const [view, setView] = useState<"activity" | "topups">("activity");
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const [amountVnd, setAmountVnd] = useState(20_000);
  const [loadingPayos, setLoadingPayos] = useState(false);

  const summary = useCreditSummary();
  const orders = usePaymentOrders();
  const history = useCreditTransactions({ page, pageSize: PAGE_SIZE, type: type === "all" ? undefined : type });

  useEffect(() => setPage(1), [type]);

  const transactions = history.data?.data ?? [];
  const total = history.data?.meta.total ?? 0;
  const totalPages = Math.max(1, history.data?.meta.totalPages ?? 1);

  const handleTopup = async () => {
    setLoadingPayos(true);
    try {
      const response = await creditsApi.createPaymentLink(amountVnd);
      const checkoutUrl = response.data?.checkoutUrl;
      if (!checkoutUrl) throw new Error("Missing checkout URL");
      const paymentWindow = window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      if (paymentWindow) paymentWindow.opener = null;
      await orders.refetch();
      setView("topups");
    } catch (error) {
      const requestError = error as AxiosError<{ error?: { message?: string } }>;
      toast.error(requestError.response?.data?.error?.message ?? t("Unable to create the payment link."));
    } finally {
      setLoadingPayos(false);
    }
  };

  const stats = [
    { label: "Available balance", value: summary.data?.balance ?? 0, icon: WalletCards, tone: "text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30" },
    { label: "Credits spent", value: summary.data?.totalSpent ?? 0, icon: ArrowUpRight, tone: "text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/30" },
    { label: "Purchased credits", value: summary.data?.totalPurchased ?? 0, icon: Banknote, tone: "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30" },
    { label: "Rewards & refunds", value: (summary.data?.totalRewards ?? 0) + (summary.data?.totalRefunded ?? 0), icon: Gift, tone: "text-violet-700 bg-violet-50 dark:text-violet-400 dark:bg-violet-950/30" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white"><ReceiptText className="h-5 w-5 text-blue-600" />{t("Wallet & credit history")}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("Track top-ups, credit usage, refunds, and rewards in one place.")}</p>
        </div>
        <Button size="sm" onClick={() => setIsTopupOpen((open) => !open)} className="gap-1.5 bg-blue-700 font-semibold text-white hover:bg-blue-800"><PlusCircle className="h-4 w-4" /> {t("Top up credits")}</Button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-zinc-950/40">
            <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", tone)}><Icon className="h-4 w-4" /></div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t(label)}</p>
            <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">{formatNumber(value)}</p>
          </div>
        ))}
      </div>

      {isTopupOpen && (
        <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/50 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t("Top up with PayOS")}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("100 VND = 1 credit. Minimum top-up is 10,000 VND.")}</p>
          <div className="my-4 flex flex-wrap gap-2">
            {[10_000, 20_000, 50_000, 100_000].map((amount) => (
              <button key={amount} type="button" onClick={() => setAmountVnd(amount)} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold transition-colors", amountVnd === amount ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-zinc-900 dark:text-slate-300")}>
                {amount.toLocaleString("vi-VN")} ₫ · {formatNumber(amount / 100)} {t("credits")}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={handleTopup} disabled={loadingPayos} className="gap-1.5 bg-blue-700 text-white hover:bg-blue-800">{loadingPayos ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}{t("Continue to secure payment")}</Button>
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">{t("LumiGap credits are used for platform features and cannot be withdrawn or converted back to cash.")}</p>
        </div>
      )}

      <div className="mb-5 flex border-b border-slate-200 dark:border-slate-800">
        {(["activity", "topups"] as const).map((item) => (
          <button key={item} type="button" onClick={() => setView(item)} className={cn("border-b-2 px-4 py-2.5 text-sm font-semibold", view === item ? "border-blue-700 text-blue-700 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200")}>{t(item === "activity" ? "Credit activity" : "Top-up history")}</button>
        ))}
      </div>

      {view === "activity" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {FILTERS.map((filter) => <button key={filter.value} type="button" onClick={() => setType(filter.value)} className={cn("rounded-full border px-3 py-1.5 text-xs font-bold transition-colors", type === filter.value ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 dark:border-slate-700 dark:bg-zinc-900 dark:text-slate-300")}>{t(filter.label)}</button>)}
          </div>
          {history.isLoading ? <LoadingState label={t("Loading credit history...")} /> : history.isError ? <ErrorState message={t("Credit history could not be loaded. Please try again.")} /> : transactions.length === 0 ? <EmptyState title={t("No credit transactions yet")} body={t("Charges, refunds, top-ups, and rewards will appear here.")} /> : (
            <>
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"><div className="divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.map((transaction) => {
                  const isCharge = transaction.type === "charge";
                  const isRefund = transaction.type === "refund";
                  return (
                    <div key={transaction.id} className="flex flex-col gap-3 bg-white px-4 py-4 dark:bg-[#121212] sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", isCharge ? "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400" : isRefund ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400")}>{isCharge ? <ArrowUpRight className="h-4 w-4" /> : isRefund ? <RotateCcw className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}</span>
                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900 dark:text-white">{t(ACTION_LABELS[transaction.action] ?? transaction.action)}</p>{transaction.status === "refunded" && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">{t("Refunded")}</span>}</div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{new Date(transaction.createdAt).toLocaleString()}</p></div>
                      </div>
                      <div className="flex items-center justify-between gap-6 pl-12 sm:justify-end sm:pl-0 sm:text-right"><div><p className={cn("font-black tabular-nums", isCharge ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>{isCharge ? "−" : "+"}{formatNumber(transaction.amount)} {t("credits")}</p>{transaction.balanceAfter !== undefined && <p className="mt-0.5 text-[10px] font-medium text-slate-400">{t("Balance:")} {formatNumber(transaction.balanceAfter)}</p>}</div></div>
                    </div>
                  );
                })}
              </div></div>
              <div className="mt-5 flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>{formatNumber(total)} {t(total === 1 ? "transaction" : "transactions")}</span><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || history.isFetching} className="h-8 gap-1"><ChevronLeft className="h-3.5 w-3.5" />{t("Previous")}</Button><span className="min-w-20 text-center font-semibold text-slate-600 dark:text-slate-300">{t("Page")} {page} / {totalPages}</span><Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || history.isFetching} className="h-8 gap-1">{t("Next")}<ChevronRight className="h-3.5 w-3.5" /></Button></div></div>
            </>
          )}
        </>
      ) : orders.isLoading ? <LoadingState label={t("Loading top-up history...")} /> : orders.isError ? <ErrorState message={t("Top-up history could not be loaded. Please try again.")} /> : !orders.data?.length ? <EmptyState title={t("No top-ups yet")} body={t("Your PayOS payment orders will appear here.")} /> : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"><div className="divide-y divide-slate-100 dark:divide-slate-800">
          {orders.data.map((order) => <div key={order.id} className="flex flex-col gap-3 bg-white px-4 py-4 dark:bg-[#121212] sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900 dark:text-white">{t("PayOS top-up")} #{order.orderCode}</p><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold capitalize", ORDER_STYLES[order.status] ?? ORDER_STYLES.pending)}>{t(order.status)}</span></div><p className="mt-1 text-xs text-slate-500">{new Date(order.createdAt).toLocaleString()}</p></div><div className="sm:text-right"><p className="font-black text-slate-900 dark:text-white">{order.amount.toLocaleString("vi-VN")} ₫</p><p className="mt-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">+{formatNumber(order.credits)} {t("credits")}</p></div></div>)}
        </div></div>
      )}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return <div className="flex min-h-48 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{label}</div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">{message}</div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center dark:border-slate-800 dark:bg-zinc-900/20"><Coins className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-700" /><p className="font-semibold text-slate-700 dark:text-slate-300">{title}</p><p className="mt-1 text-xs text-slate-500">{body}</p></div>;
}
