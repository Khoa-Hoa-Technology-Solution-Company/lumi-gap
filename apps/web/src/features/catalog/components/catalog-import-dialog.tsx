import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { CatalogKeyword, Tag, TaxonomyNode, TopicBackfillTargetKind } from "@trend/shared-types";
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
import { backfillErrorCode, useAdminRequestTopicBackfill } from "@/features/topic-backfill";
import { tagsApi, taxonomyApi } from "../api/catalog.api";
import { useUpsertTopicWatch } from "../hooks/use-topic-watches";
import { AsyncPicker } from "./async-picker";
import { BACKFILL_DEFAULT_PAPERS, BACKFILL_MAX_PAPERS, BACKFILL_MIN_PAPERS, parseBackfillBudget } from "./backfill-dialog";
import { LevelBadge } from "./catalog-badges";
import { apiErr } from "./catalog-ui";

type ImportOption =
  | { kind: "topic" | "subfield"; id: string; name: string; paperCount: number; node: TaxonomyNode }
  | { kind: "keyword"; id: string; name: string; paperCount: number; keyword: CatalogKeyword }
  | { kind: "tag"; id: string; name: string; paperCount: number; tag: Tag };

const KIND_ORDER: TopicBackfillTargetKind[] = ["topic", "subfield", "keyword", "tag"];
const KIND_LABELS: Record<TopicBackfillTargetKind, string> = {
  topic: "Topics",
  subfield: "Subfields",
  keyword: "Keywords",
  tag: "Tags",
};
const KIND_SINGULAR: Record<TopicBackfillTargetKind, string> = {
  topic: "Topic",
  subfield: "Subfield",
  keyword: "Keyword",
  tag: "Tag",
};
const optionKey = (option: ImportOption) => `${option.kind}:${option.id}`;

/** Topics, subfields, keywords and tags only: domain and field nodes are too broad to import from directly. */
async function searchImportTargets(query: string): Promise<ImportOption[]> {
  const base = { q: query, status: "active" as const, sort: "paperCount" as const, pageSize: 6 };
  const [topics, subfields, keywords, tags] = await Promise.all([
    taxonomyApi.listNodes({ ...base, level: "topic" }),
    taxonomyApi.listNodes({ ...base, level: "subfield" }),
    taxonomyApi.listKeywords(base),
    tagsApi.list({ q: query, status: "active", pageSize: 6 }),
  ]);
  const options: ImportOption[] = [];
  for (const node of [...topics.data, ...subfields.data]) {
    if (node.level === "topic" || node.level === "subfield") {
      options.push({ kind: node.level, id: node.id, name: node.name, paperCount: node.paperCount, node });
    }
  }
  for (const keyword of keywords.data) {
    options.push({ kind: "keyword", id: keyword.id, name: keyword.keywordName, paperCount: keyword.paperCount, keyword });
  }
  for (const tag of tags.data) {
    options.push({ kind: "tag", id: tag.id, name: tag.name, paperCount: tag.paperCount, tag });
  }
  return options.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

export function CatalogImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open ? <CatalogImportForm onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CatalogImportForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const request = useAdminRequestTopicBackfill();
  const follow = useUpsertTopicWatch();
  const [picked, setPicked] = useState<ImportOption | null>(null);
  const [value, setValue] = useState(String(BACKFILL_DEFAULT_PAPERS));
  const budget = parseBackfillBudget(value);
  const invalid = budget === undefined;
  const busy = request.isPending || follow.isPending;

  const failure = (error: unknown) =>
    backfillErrorCode(error) === "TAG_HAS_NO_INCLUDE_RULES" ? t("Add an include rule first.") : t(apiErr(error));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!picked || budget === undefined) return;
    try {
      const result = await request.mutateAsync({ targetKind: picked.kind, targetId: picked.id, maxNewPapers: budget });
      toast.success(result.created
        ? t("Import started for “{{name}}”. It runs in the background.", { name: picked.name })
        : t("An import for “{{name}}” is already running.", { name: picked.name }));
      onClose();
    } catch (error) {
      toast.error(failure(error));
    }
  }

  async function followDaily() {
    if (!picked) return;
    try {
      await follow.mutateAsync({ targetKind: picked.kind, targetId: picked.id });
      toast.success(t("“{{name}}” is now followed daily.", { name: picked.name }));
      onClose();
    } catch (error) {
      toast.error(failure(error));
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <DialogHeader className="text-left">
        <DialogTitle>{t("Import from catalogue")}</DialogTitle>
        <DialogDescription>
          {t("Pick a topic, subfield, keyword or tag from the catalogue and import its papers from OpenAlex.")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <AsyncPicker<ImportOption>
          label={t("Search the catalogue")}
          placeholder={t("Search topics, subfields, keywords or tags…")}
          cacheKey="catalog-import-targets"
          fetcher={searchImportTargets}
          getKey={optionKey}
          getGroup={(option) => t(KIND_LABELS[option.kind])}
          isSelected={(option) => picked !== null && optionKey(option) === optionKey(picked)}
          onSelect={setPicked}
          renderOption={(option) => (
            <span className="flex min-h-[28px] flex-wrap items-center gap-2">
              {option.kind === "topic" || option.kind === "subfield" ? <LevelBadge level={option.node.level} /> : null}
              <span className="min-w-0 flex-1 break-words font-medium">{option.name}</span>
              <span className="text-xs text-muted-foreground">{t("{{count}} papers", { count: option.paperCount })}</span>
            </span>
          )}
        />
        <p className="text-xs text-muted-foreground">
          {t("For a whole domain or field, create a tag with that rule first in")}{" "}
          <Link to="/admin/tags" className="font-medium text-primary underline underline-offset-2">{t("Tags")}</Link>.
        </p>
      </div>

      {picked ? (
        <>
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{picked.name}</p>
              <p className="text-xs text-muted-foreground">{t(KIND_SINGULAR[picked.kind])}</p>
            </div>
            <Button type="button" variant="ghost" className="h-11 shrink-0" onClick={() => setPicked(null)} aria-label={t("Clear selected entry")}>
              {t("Clear")}
            </Button>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="catalog-import-max-papers" className="text-sm font-medium">{t("New papers to import")}</label>
            <Input
              id="catalog-import-max-papers"
              type="number"
              inputMode="numeric"
              min={BACKFILL_MIN_PAPERS}
              max={BACKFILL_MAX_PAPERS}
              step={1}
              value={value}
              aria-invalid={invalid}
              aria-describedby="catalog-import-max-papers-hint"
              onChange={(event) => setValue(event.target.value)}
              className="h-11 max-w-[10rem]"
            />
            <p id="catalog-import-max-papers-hint" className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={invalid ? "alert" : undefined}>
              {invalid
                ? t("Enter a whole number from {{min}} to {{max}}.", { min: BACKFILL_MIN_PAPERS, max: BACKFILL_MAX_PAPERS })
                : t("The import stops after this many new papers. Papers already in LumiGap are skipped.")}
            </p>
          </div>
        </>
      ) : null}

      <DialogFooter className="gap-2 sm:justify-end">
        <Button type="button" variant="outline" className="h-11" onClick={onClose}>{t("Cancel")}</Button>
        <Button type="button" variant="outline" className="h-11" disabled={!picked || busy} onClick={() => void followDaily()}>
          {follow.isPending ? t("Starting…") : t("Follow daily")}
        </Button>
        <Button type="submit" className="h-11" disabled={!picked || invalid || busy}>
          {request.isPending ? t("Starting…") : t("Import now")}
        </Button>
      </DialogFooter>
    </form>
  );
}
