import { useEffect, useMemo, useState } from "react";
import type { AxiosError } from "axios";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Coins,
  ExternalLink,
  Info,
  PlusCircle,
  RotateCcw,
} from "lucide-react";
import type { CreditAction, CreditTransactionType, PaymentOrderStatus } from "@trend/shared-types";
import { toast } from "sonner";
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
import { InlineLoader, SectionEmptyState, SectionErrorState, SkeletonList } from "@/components/loading";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";
import { useCreditSummary, useCreditTransactions, usePaymentOrders } from "../hooks/use-credits";
import { creditsApi } from "../api/credits.api";
import { SettingsPageHeader, SettingsSection } from "@/features/settings/components/settings-primitives";

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
  gap_closure_check: "Gap closure check",
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
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  cancelled: "border-border bg-muted text-muted-foreground",
  expired: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function CreditHistory() {
  const { t, language } = useI18n();
  const [page, setPage] = useState(1);
  const [type, setType] = useState<CreditTransactionType | "all">("all");
  const [view, setView] = useState<"activity" | "topups">("activity");
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const [amountVnd, setAmountVnd] = useState(20_000);
  const [loadingPayos, setLoadingPayos] = useState(false);

  const summary = useCreditSummary();
  const orders = usePaymentOrders();
  const history = useCreditTransactions({
    page,
    pageSize: PAGE_SIZE,
    type: type === "all" ? undefined : type,
  });

  useEffect(() => setPage(1), [type]);

  const transactions = history.data?.data ?? [];
  const total = history.data?.meta.total ?? 0;
  const totalPages = Math.max(1, history.data?.meta.totalPages ?? 1);

  // Real usage breakdown from loaded debit transactions (no fake charts when empty)
  const featureBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.type !== "charge") continue;
      const label = ACTION_LABELS[tx.action] ?? tx.action;
      map.set(label, (map.get(label) ?? 0) + tx.amount);
    }
    const items = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxAmount = items[0]?.[1] ?? 1;
    return { items, maxAmount };
  }, [transactions]);

  const handleTopup = async () => {
    setLoadingPayos(true);
    try {
      const response = await creditsApi.createPaymentLink(amountVnd);
      const checkoutUrl = response.data?.checkoutUrl;
      if (!checkoutUrl) throw new Error("Missing checkout URL");
      const paymentWindow = window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      if (paymentWindow) paymentWindow.opener = null;
      await orders.refetch();
      setIsTopupOpen(false);
      setView("topups");
    } catch (error) {
      const requestError = error as AxiosError<{ error?: { message?: string } }>;
      toast.error(requestError.response?.data?.error?.message ?? t("Unable to create the payment link."));
    } finally {
      setLoadingPayos(false);
    }
  };

  const metrics = [
    { label: "Available balance", value: summary.data?.balance ?? 0 },
    { label: "Credits spent", value: summary.data?.totalSpent ?? 0 },
    { label: "Purchased credits", value: summary.data?.totalPurchased ?? 0 },
    {
      label: "Rewards & refunds",
      value: (summary.data?.totalRewards ?? 0) + (summary.data?.totalRefunded ?? 0),
    },
  ];

  return (
    <div data-no-i18n>
      <SettingsPageHeader
        title={t("settings.credits.title")}
        description={t("settings.credits.subtitle")}
        action={
          <Button size="sm" onClick={() => setIsTopupOpen(true)} className="gap-1.5">
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            <span>{t("Top up credits")}</span>
          </Button>
        }
      />

      {/* Compact, clean metric strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-border/80 bg-background px-4 py-3.5">
            <p className="text-xs font-medium text-muted-foreground">{t(label)}</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatNumber(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Clear separation note: AI credits vs Community points vs Academic contributions */}
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border/80 bg-muted/25 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>{t("settings.credits.separationNote")}</p>
      </div>

      {/* Real usage breakdown bar chart — only shown when meaningful debit data exists */}
      {featureBreakdown.items.length > 0 ? (
        <SettingsSection
          title={t("settings.credits.breakdownTitle")}
          description={t("settings.credits.breakdownDesc")}
        >
          <div className="space-y-2.5 max-w-xl">
            {featureBreakdown.items.map(([label, amount]) => {
              const pct = Math.max(6, Math.round((amount / featureBreakdown.maxAmount) * 100));
              return (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{t(label)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatNumber(amount)} {t("credits")}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/80" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsSection>
      ) : null}

      {/* Ledger & Top-up Tabs */}
      <div className="mt-6 flex items-center justify-between gap-3 border-b border-border/80">
        <div className="flex gap-1" role="tablist">
          {(["activity", "topups"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={view === item}
              onClick={() => setView(item)}
              className={cn(
                "-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                view === item
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(item === "activity" ? "Credit activity" : "Top-up history")}
            </button>
          ))}
        </div>
        {(history.isFetching && !history.isLoading) || (orders.isFetching && !orders.isLoading) ? (
          <InlineLoader label={t("loading.refreshing")} />
        ) : null}
      </div>

      {view === "activity" ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Filter transactions")}>
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={type === filter.value}
                onClick={() => setType(filter.value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  type === filter.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {t(filter.label)}
              </button>
            ))}
          </div>

          {history.isLoading ? (
            <SkeletonList items={4} />
          ) : history.isError ? (
            <SectionErrorState
              compact
              error={history.error}
              title={t("Credit history could not be loaded. Please try again.")}
              onRetry={() => void history.refetch()}
              retrying={history.isFetching}
            />
          ) : transactions.length === 0 ? (
            <SectionEmptyState
              icon={<Coins className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />}
              title={t("No credit transactions yet")}
              description={t("Charges, refunds, top-ups, and rewards will appear here.")}
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-border/80">
                <div className="divide-y divide-border/60">
                  {transactions.map((transaction) => {
                    const isCharge = transaction.type === "charge";
                    const isRefund = transaction.type === "refund";
                    return (
                      <div
                        key={transaction.id}
                        className="flex flex-col gap-2.5 bg-background px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={cn(
                              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                              isCharge
                                ? "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                : isRefund
                                  ? "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                  : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                            )}
                          >
                            {isCharge ? (
                              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                            ) : isRefund ? (
                              <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {t(ACTION_LABELS[transaction.action] ?? transaction.action)}
                              </p>
                              {transaction.status === "refunded" ? (
                                <Badge variant="outline" className="text-[10px]">
                                  {t("Refunded")}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {new Date(transaction.createdAt).toLocaleString(language)}
                            </p>
                          </div>
                        </div>

                        <div className="pl-11 text-left sm:pl-0 sm:text-right">
                          <p
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              isCharge
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-emerald-600 dark:text-emerald-400",
                            )}
                          >
                            {isCharge ? "−" : "+"}
                            {formatNumber(transaction.amount)} {t("credits")}
                          </p>
                          {transaction.balanceAfter !== undefined ? (
                            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                              {t("Balance:")} {formatNumber(transaction.balanceAfter)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {formatNumber(total)} {t(total === 1 ? "transaction" : "transactions")}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1 || history.isFetching}
                    className="h-8 gap-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("Previous")}</span>
                  </Button>
                  <span className="min-w-20 text-center font-medium text-foreground">
                    {t("Page")} {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages || history.isFetching}
                    className="h-8 gap-1"
                  >
                    <span>{t("Next")}</span>
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {orders.isLoading ? (
            <SkeletonList items={3} />
          ) : orders.isError ? (
            <SectionErrorState
              compact
              error={orders.error}
              title={t("Top-up history could not be loaded. Please try again.")}
              onRetry={() => void orders.refetch()}
              retrying={orders.isFetching}
            />
          ) : !orders.data?.length ? (
            <SectionEmptyState
              icon={<Coins className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />}
              title={t("No top-ups yet")}
              description={t("Your PayOS payment orders will appear here.")}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/80">
              <div className="divide-y divide-border/60">
                {orders.data.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-col gap-2 bg-background px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {t("PayOS top-up")} #{order.orderCode}
                        </p>
                        <Badge variant="outline" className={cn("text-[11px] capitalize", ORDER_STYLES[order.status] ?? ORDER_STYLES.pending)}>
                          {t(order.status)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleString(language)}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {order.amount.toLocaleString("vi-VN")} ₫
                      </p>
                      <p className="mt-0.5 text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                        +{formatNumber(order.credits)} {t("credits")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PayOS Top-up Dialog */}
      <Dialog open={isTopupOpen} onOpenChange={(open) => { if (!loadingPayos) setIsTopupOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Top up with PayOS")}</DialogTitle>
            <DialogDescription>
              {t("100 VND = 1 credit. Minimum top-up is 10,000 VND.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2.5 py-2">
            {[10_000, 20_000, 50_000, 100_000].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setAmountVnd(amount)}
                className={cn(
                  "rounded-xl border px-3.5 py-3 text-left transition-colors",
                  amountVnd === amount
                    ? "border-primary bg-primary/8 text-primary"
                    : "border-border bg-background text-foreground hover:border-primary/40",
                )}
              >
                <p className="text-sm font-semibold tabular-nums">{amount.toLocaleString("vi-VN")} ₫</p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(amount / 100)} {t("credits")}
                </p>
              </button>
            ))}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("LumiGap credits are used for platform features and cannot be withdrawn or converted back to cash.")}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={loadingPayos} onClick={() => setIsTopupOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button type="button" loading={loadingPayos} onClick={() => void handleTopup()} className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("Continue to secure payment")}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
