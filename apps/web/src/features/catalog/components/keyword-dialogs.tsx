import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { CatalogKeyword } from "@trend/shared-types";
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
import { useI18n } from "@/i18n";
import { taxonomyApi } from "../api/catalog.api";
import { useMergeCatalogKeyword, useUpdateCatalogKeyword } from "../hooks/use-taxonomy";
import { AsyncPicker } from "./async-picker";
import { apiErr, SELECT_CLASS } from "./catalog-ui";
import { ChipInput } from "./chip-input";

export function EditKeywordDialog({ keyword, onClose }: { keyword?: CatalogKeyword; onClose: () => void }) {
  return (
    <Dialog open={Boolean(keyword)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {keyword ? <EditKeywordForm key={keyword.id} keyword={keyword} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditKeywordForm({ keyword, onClose }: { keyword: CatalogKeyword; onClose: () => void }) {
  const { t } = useI18n();
  const update = useUpdateCatalogKeyword();
  const [name, setName] = useState(keyword.keywordName);
  const [aliases, setAliases] = useState(keyword.aliases);
  const [status, setStatus] = useState<"active" | "hidden">(keyword.status === "hidden" ? "hidden" : "active");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync({
        id: keyword.id,
        input: { keywordName: name.trim(), aliases, status },
      });
      toast.success(t("Keyword saved."));
      onClose();
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <DialogHeader className="text-left">
        <DialogTitle>{t("Edit keyword")}</DialogTitle>
        <DialogDescription>
          {t("Changing the display name does not change which papers carry the keyword.")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <label htmlFor="keyword-name" className="text-sm font-medium">{t("Display name")}</label>
        <Input id="keyword-name" value={name} maxLength={300} required onChange={(event) => setName(event.target.value)} />
      </div>

      <ChipInput values={aliases} onChange={setAliases} label={t("Aliases")} max={200} />

      <div className="space-y-1.5">
        <label htmlFor="keyword-status" className="text-sm font-medium">{t("Visibility")}</label>
        <div>
          <select
            id="keyword-status"
            className={SELECT_CLASS}
            value={status}
            onChange={(event) => setStatus(event.target.value as "active" | "hidden")}
          >
            <option value="active">{t("Active")}</option>
            <option value="hidden">{t("Hidden")}</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground">{t("Hidden keywords are left out of filters and tag suggestions.")}</p>
      </div>

      <DialogFooter className="gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
        <Button type="submit" disabled={!name.trim() || update.isPending}>
          {update.isPending ? t("Saving…") : t("Save changes")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MergeKeywordDialog({ keyword, onClose }: { keyword?: CatalogKeyword; onClose: () => void }) {
  return (
    <Dialog open={Boolean(keyword)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {keyword ? <MergeKeywordForm key={keyword.id} keyword={keyword} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MergeKeywordForm({ keyword, onClose }: { keyword: CatalogKeyword; onClose: () => void }) {
  const { t } = useI18n();
  const merge = useMergeCatalogKeyword();
  const [target, setTarget] = useState<CatalogKeyword>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    try {
      await merge.mutateAsync({ id: keyword.id, targetId: target.id });
      toast.success(t("Merged “{{source}}” into “{{target}}”.", { source: keyword.keywordName, target: target.keywordName }));
      onClose();
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <DialogHeader className="text-left">
        <DialogTitle>{t("Merge keyword")}</DialogTitle>
        <DialogDescription>
          {t("Papers, tag rules and aliases of this keyword move to the target keyword. This cannot be undone.")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("Merge into")}</p>
        <AsyncPicker<CatalogKeyword>
          label={t("Search the target keyword")}
          placeholder={t("Search keywords…")}
          cacheKey="keyword-merge-target"
          fetcher={async (q) => {
            const result = await taxonomyApi.listKeywords({ q, status: "active", sort: "paperCount", pageSize: 10 });
            return result.data.filter((item) => item.id !== keyword.id && item.status === "active");
          }}
          getKey={(item) => item.id}
          onSelect={setTarget}
          renderOption={(item) => (
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 break-words font-medium">{item.keywordName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{t("{{count}} papers", { count: item.paperCount })}</span>
            </span>
          )}
        />
      </div>

      {target ? (
        <p role="status" className="rounded-md border bg-muted/50 p-3 text-sm">
          {t("Merge “{{source}}” ({{count}} papers) into “{{target}}”", {
            source: keyword.keywordName,
            count: keyword.paperCount,
            target: target.keywordName,
          })}
        </p>
      ) : null}

      <DialogFooter className="gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
        <Button type="submit" variant="destructive" disabled={!target || merge.isPending}>
          {merge.isPending ? t("Merging…") : t("Merge keywords")}
        </Button>
      </DialogFooter>
    </form>
  );
}
