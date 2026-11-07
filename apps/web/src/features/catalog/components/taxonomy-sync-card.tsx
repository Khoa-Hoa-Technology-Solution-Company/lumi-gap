import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useRequestTaxonomySync, useTaxonomySyncStatus } from "../hooks/use-taxonomy";
import { apiErr, formatDateTime } from "./catalog-ui";

/**
 * State of the OpenAlex taxonomy catalogue, with a button to load or update it. With `onlyWhenEmpty` it stays hidden
 * once the catalogue is loaded, for pages that merely depend on it.
 */
export function TaxonomySyncCard({ onlyWhenEmpty = false }: { onlyWhenEmpty?: boolean }) {
  const { t } = useI18n();
  const status = useTaxonomySyncStatus();
  const request = useRequestTaxonomySync();
  const data = status.data;

  if (!data || (onlyWhenEmpty && data.loaded)) return null;

  const sync = () => request.mutate(undefined, {
    onSuccess: (result) => toast.success(result.queued ? t("Taxonomy update queued.") : t("A taxonomy update is already running.")),
    onError: (error) => toast.error(t(apiErr(error))),
  });

  const message = data.running
    ? t("Loading the taxonomy from OpenAlex. This takes a few minutes and runs in the background.")
    : data.loaded
      ? t("Last updated from OpenAlex: {{date}}", { date: formatDateTime(data.lastSyncedAt) })
      : t("The taxonomy is empty, so there are no topics to follow or tag yet. Load it from OpenAlex first.");

  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${data.loaded ? "bg-card" : "border-destructive/40 bg-destructive/5"}`}
      aria-label={t("Taxonomy update")}
      data-testid="taxonomy-sync-card"
    >
      <div className="min-w-0 space-y-1 text-sm">
        <p role={data.loaded ? undefined : "status"}>{message}</p>
        {data.lastError ? <p role="alert" className="break-words text-destructive">{t("The last update failed: {{error}}", { error: data.lastError })}</p> : null}
      </div>
      <Button size="sm" className="w-full shrink-0 sm:w-auto" disabled={data.running || request.isPending} onClick={sync}>
        {data.loaded ? t("Update taxonomy") : t("Load taxonomy")}
      </Button>
    </section>
  );
}
