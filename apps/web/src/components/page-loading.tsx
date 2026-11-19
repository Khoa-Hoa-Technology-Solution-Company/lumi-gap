import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { Skeleton } from "./ui/skeleton";

export function PageLoading({ className }: { className?: string }) {
  const { t } = useI18n();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);
  return <div role="status" aria-live="polite" aria-busy="true" className={cn("flex min-h-[50vh] items-center justify-center bg-background p-6 text-foreground", className)}>
    <div className="w-full max-w-sm space-y-4">
      <p className="text-sm font-medium">{t("Loading page...")}</p>
      <div className="space-y-3" aria-hidden="true"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /></div>
      {slow && <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t("Retry")}</button>}
    </div>
  </div>;
}
