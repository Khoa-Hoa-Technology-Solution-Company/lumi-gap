import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FolderTree, Search } from "lucide-react";
import { toast } from "sonner";
import type { TaxonomyNode, TaxonomyNodeDetail, TaxonomyNodeStatus } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { useTaxonomyNode, useUpdateTaxonomyNode } from "../hooks/use-taxonomy";
import { nodeSearchHref } from "../utils/tag-rules";
import { LevelBadge } from "./catalog-badges";
import { ChipInput } from "./chip-input";
import { apiErr, ErrorState, formatCompact, SELECT_CLASS } from "./catalog-ui";

const TEXTAREA_CLASS =
  "min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function NodeDetailSheet({ nodeId, onSelectNode, onBrowseChildren, onClose }: {
  nodeId?: string;
  /** Show another node (an ancestor or a child) in this sheet. */
  onSelectNode: (id: string) => void;
  /** Close the sheet and list the node's children in the table. */
  onBrowseChildren: (node: TaxonomyNode) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const query = useTaxonomyNode(nodeId);

  return (
    <Sheet open={Boolean(nodeId)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent closeLabel={t("Close node details")} className="gap-0 p-0">
        {query.isError ? (
          <>
            <SheetTitle className="sr-only">{t("Taxonomy node")}</SheetTitle>
            <SheetDescription className="sr-only">{t("Details of a taxonomy node")}</SheetDescription>
            <ErrorState onRetry={() => query.refetch()} />
          </>
        ) : query.data ? (
          <NodeEditor
            key={query.data.id}
            node={query.data}
            onSelectNode={onSelectNode}
            onBrowseChildren={onBrowseChildren}
          />
        ) : (
          <div className="space-y-4 p-6">
            <SheetTitle className="sr-only">{t("Taxonomy node")}</SheetTitle>
            <SheetDescription className="sr-only">{t("Details of a taxonomy node")}</SheetDescription>
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function NodeEditor({ node, onSelectNode, onBrowseChildren }: {
  node: TaxonomyNodeDetail;
  onSelectNode: (id: string) => void;
  onBrowseChildren: (node: TaxonomyNode) => void;
}) {
  const { t } = useI18n();
  const update = useUpdateTaxonomyNode();
  const [aliases, setAliases] = useState(node.aliases);
  const [status, setStatus] = useState<TaxonomyNodeStatus>(node.status);
  const [description, setDescription] = useState(node.description ?? "");

  const dirty =
    status !== node.status ||
    description.trim() !== (node.description ?? "") ||
    aliases.length !== node.aliases.length ||
    aliases.some((alias, index) => alias !== node.aliases[index]);

  async function save() {
    try {
      await update.mutateAsync({
        id: node.id,
        input: { aliases, status, description: description.trim() || null },
      });
      toast.success(t("Taxonomy node saved."));
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b p-6 pr-14">
        <nav aria-label={t("Taxonomy path")} className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <FolderTree className="h-3.5 w-3.5" aria-hidden="true" />
          {node.ancestors.map((ancestor) => (
            <span key={ancestor.id} className="inline-flex items-center gap-1">
              <button type="button" className="rounded px-1 hover:bg-muted hover:text-foreground" onClick={() => onSelectNode(ancestor.id)}>
                {ancestor.name}
              </button>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </span>
          ))}
          <span className="font-medium text-foreground">{node.name}</span>
        </nav>
        <SheetTitle>{node.name}</SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={node.level} />
            <span>{t("{{count}} local papers", { count: node.paperCount })}</span>
            <span aria-hidden="true">·</span>
            <span>{t("{{count}} OpenAlex works", { count: formatCompact(node.worksCount) })}</span>
          </div>
        </SheetDescription>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="space-y-1.5">
          <label htmlFor="node-status" className="text-sm font-medium">{t("Status")}</label>
          <div>
            <select
              id="node-status"
              className={SELECT_CLASS}
              value={status}
              onChange={(event) => setStatus(event.target.value as TaxonomyNodeStatus)}
            >
              <option value="active">{t("Active")}</option>
              <option value="hidden">{t("Hidden")}</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">{t("Hidden nodes are left out of filters and tag suggestions.")}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="node-description" className="text-sm font-medium">{t("Description")}</label>
          <textarea
            id="node-description"
            className={TEXTAREA_CLASS}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <ChipInput values={aliases} onChange={setAliases} label={t("Aliases")} max={200} />

        {node.openalexKeywords.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("OpenAlex keywords")}</p>
            <p className="text-sm text-muted-foreground">{node.openalexKeywords.join(", ")}</p>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t("Children ({{count}})", { count: node.childCount })}</p>
            {node.children.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => onBrowseChildren(node)}>
                {t("Browse in table")}
              </Button>
            ) : null}
          </div>
          {node.children.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("This node has no children.")}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {node.children.map((child) => (
                <li key={child.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => onSelectNode(child.id)}
                  >
                    <LevelBadge level={child.level} />
                    <span className="min-w-0 flex-1 break-words">{child.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{child.paperCount}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="ghost" size="sm" className="justify-start">
          <Link to={nodeSearchHref(node)}>
            <Search className="h-4 w-4" />
            {t("Search papers in this topic")}
          </Link>
        </Button>
        <Button onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? t("Saving…") : t("Save changes")}
        </Button>
      </div>
    </div>
  );
}
