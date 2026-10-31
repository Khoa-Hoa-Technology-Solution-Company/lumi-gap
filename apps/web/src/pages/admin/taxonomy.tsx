import { useDeferredValue, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import type { TaxonomyLevel, TaxonomyNode, TaxonomyNodeStatus } from "@trend/shared-types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AliasBadges, LevelBadge, StatusBadge } from "@/features/catalog/components/catalog-badges";
import {
  ErrorState,
  formatCompact,
  formatPercent,
  PaginationBar,
  SELECT_CLASS,
  StatCard,
  TableMessageRow,
  TableSkeletonRows,
} from "@/features/catalog/components/catalog-ui";
import { NodeDetailSheet } from "@/features/catalog/components/node-detail-sheet";
import { useTaxonomyNodes, useTaxonomyStats } from "@/features/catalog/hooks/use-taxonomy";
import { useI18n } from "@/i18n";

const LEVELS: TaxonomyLevel[] = ["domain", "field", "subfield", "topic"];
const LEVEL_TAB_LABELS: Record<TaxonomyLevel, string> = {
  domain: "Domains",
  field: "Fields",
  subfield: "Subfields",
  topic: "Topics",
};
type Sort = "paperCount" | "worksCount" | "name";

export function AdminTaxonomyPage() {
  const { t } = useI18n();
  const stats = useTaxonomyStats();

  const [level, setLevel] = useState<TaxonomyLevel>("domain");
  const [parent, setParent] = useState<Pick<TaxonomyNode, "id" | "name" | "level"> | undefined>();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState<TaxonomyNodeStatus | "all">("all");
  const [sort, setSort] = useState<Sort>("paperCount");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();

  useEffect(() => setPage(1), [level, parent?.id, q, status, sort]);

  const nodes = useTaxonomyNodes({
    level,
    ...(parent ? { parentId: parent.id } : {}),
    ...(q ? { q } : {}),
    ...(status !== "all" ? { status } : {}),
    sort,
    page,
    pageSize: 20,
  });

  function switchLevel(next: TaxonomyLevel) {
    setLevel(next);
    setParent(undefined);
  }

  function browseChildren(node: TaxonomyNode) {
    const childLevel = LEVELS[LEVELS.indexOf(node.level) + 1];
    if (!childLevel) return;
    setParent({ id: node.id, name: node.name, level: node.level });
    setLevel(childLevel);
    setSelectedId(undefined);
  }

  const s = stats.data;
  const rows = nodes.data?.data;

  return (
    <main className="space-y-6">
      <PageHeader
        title="Taxonomy"
        description="Browse the OpenAlex domain, field, subfield and topic tree, and curate aliases and visibility."
      />

      <section aria-label={t("Taxonomy statistics")} className="space-y-3">
        {stats.isError ? (
          <div className="rounded-xl border bg-card"><ErrorState onRetry={() => stats.refetch()} /></div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label={t("Active papers")} value={s ? formatCompact(s.papers) : undefined} loading={stats.isLoading} />
              <StatCard
                label={t("With a topic")}
                value={s ? formatCompact(s.withTopic) : undefined}
                hint={s ? t("{{percent}} of papers", { percent: formatPercent(s.withTopic, s.papers) }) : undefined}
                loading={stats.isLoading}
              />
              <StatCard
                label={t("With a keyword")}
                value={s ? formatCompact(s.withKeyword) : undefined}
                hint={s ? t("{{percent}} of papers", { percent: formatPercent(s.withKeyword, s.papers) }) : undefined}
                loading={stats.isLoading}
              />
              <StatCard
                label={t("Active keywords")}
                value={s?.keywords.active}
                hint={s ? t("{{merged}} merged · {{hidden}} hidden", { merged: s.keywords.merged, hidden: s.keywords.hidden }) : undefined}
                loading={stats.isLoading}
              />
              <StatCard
                label={t("Active tags")}
                value={s?.tags.active}
                hint={s ? t("{{count}} archived", { count: s.tags.archived }) : undefined}
                loading={stats.isLoading}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {LEVELS.map((item) => (
                <StatCard
                  key={item}
                  label={t(LEVEL_TAB_LABELS[item])}
                  value={s?.nodesByLevel[item]}
                  loading={stats.isLoading}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4">
          <div role="group" aria-label={t("Taxonomy level")} className="flex flex-wrap gap-1.5">
            {LEVELS.map((item) => (
              <Button
                key={item}
                size="sm"
                variant={item === level ? "default" : "outline"}
                aria-pressed={item === level}
                onClick={() => switchLevel(item)}
              >
                {t(LEVEL_TAB_LABELS[item])}
              </Button>
            ))}
          </div>

          {parent ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {t("Showing {{level}} inside “{{name}}”", { level: t(LEVEL_TAB_LABELS[level]).toLowerCase(), name: parent.name })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setParent(undefined)}>
                <X className="h-3.5 w-3.5" />
                {t("Clear parent")}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1 lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t("Search taxonomy")}
                placeholder={t("Search by name…")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <select
              aria-label={t("Filter by status")}
              className={SELECT_CLASS}
              value={status}
              onChange={(event) => setStatus(event.target.value as TaxonomyNodeStatus | "all")}
            >
              <option value="all">{t("All statuses")}</option>
              <option value="active">{t("Active")}</option>
              <option value="hidden">{t("Hidden")}</option>
            </select>
            <select aria-label={t("Sort nodes")} className={SELECT_CLASS} value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="paperCount">{t("Most local papers")}</option>
              <option value="worksCount">{t("Most OpenAlex works")}</option>
              <option value="name">{t("Name")}</option>
            </select>
          </div>
        </div>

        {nodes.isError ? (
          <ErrorState onRetry={() => nodes.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Name")}</TableHead>
                  <TableHead>{t("Level")}</TableHead>
                  <TableHead className="text-right">{t("Local papers")}</TableHead>
                  <TableHead className="text-right">{t("OpenAlex works")}</TableHead>
                  <TableHead>{t("Aliases")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.isLoading ? (
                  <TableSkeletonRows columns={6} />
                ) : rows?.length ? (
                  rows.map((node) => (
                    <TableRow
                      key={node.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      onClick={() => setSelectedId(node.id)}
                      onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(node.id); }}
                    >
                      <TableCell className="max-w-[320px]">
                        <div className="font-medium">{node.name}</div>
                        {node.childCount > 0 ? (
                          <div className="text-xs text-muted-foreground">{t("{{count}} children", { count: node.childCount })}</div>
                        ) : null}
                      </TableCell>
                      <TableCell><LevelBadge level={node.level} /></TableCell>
                      <TableCell className="text-right tabular-nums">{node.paperCount.toLocaleString("en")}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCompact(node.worksCount)}</TableCell>
                      <TableCell><AliasBadges aliases={node.aliases} /></TableCell>
                      <TableCell><StatusBadge status={node.status} /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableMessageRow columns={6}>
                    {t("No {{level}} match the current filters.", { level: t(LEVEL_TAB_LABELS[level]).toLowerCase() })}
                  </TableMessageRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar meta={nodes.data?.meta} page={page} onPage={setPage} isFetching={nodes.isFetching} noun="nodes" />
      </section>

      <NodeDetailSheet
        nodeId={selectedId}
        onSelectNode={setSelectedId}
        onBrowseChildren={browseChildren}
        onClose={() => setSelectedId(undefined)}
      />
    </main>
  );
}

