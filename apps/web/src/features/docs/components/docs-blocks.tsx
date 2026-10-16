import { AlertTriangle, BookMarked, Calculator, Info, Ruler, Sigma } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { docsPath, type DocsSectionId } from "../docs-section-ids";
import type { DocsBlock, DocsCalloutTone } from "../docs.types";
import { DocsBibliography, DocsSourcesList } from "./docs-bibliography";
import { useDocsContext } from "./docs-context";
import { DocsGlossary } from "./docs-glossary";
import { DocsAnchorHeading } from "./docs-heading";
import { DocsRichText } from "./docs-rich-text";

const TONE_STYLE: Record<DocsCalloutTone, { box: string; badge: string; icon: LucideIcon }> = {
  standard: {
    box: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20",
    badge: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
    icon: BookMarked,
  },
  derived: {
    box: "border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/20",
    badge: "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
    icon: Sigma,
  },
  convention: {
    box: "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20",
    badge: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
    icon: Ruler,
  },
  limitation: {
    box: "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20",
    badge: "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200",
    icon: AlertTriangle,
  },
  note: {
    box: "border-border bg-muted/50",
    badge: "border-border bg-background text-muted-foreground",
    icon: Info,
  },
};

export function DocsBlocks({ blocks, sectionId }: { blocks: DocsBlock[]; sectionId: DocsSectionId }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, index) => <DocsBlockView key={index} block={block} sectionId={sectionId} />)}
    </div>
  );
}

function DocsBlockView({ block, sectionId }: { block: DocsBlock; sectionId: DocsSectionId }) {
  const { ui } = useDocsContext();

  switch (block.kind) {
    case "paragraph":
      return <p className="leading-7 text-foreground/90"><DocsRichText text={block.text} /></p>;

    case "heading":
      return (
        <div className="pt-4">
          <DocsAnchorHeading as="h2" id={block.id} path={docsPath(sectionId, block.id)} className="text-xl font-semibold tracking-tight text-foreground">
            {block.text}
          </DocsAnchorHeading>
        </div>
      );

    case "formula":
      return (
        <figure className="overflow-hidden rounded-lg border bg-muted/40">
          {block.caption ? <figcaption className="border-b px-4 py-2 text-sm font-medium text-muted-foreground">{block.caption}</figcaption> : null}
          <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-6 text-foreground sm:text-sm" data-no-i18n>
            {block.lines.join("\n")}
          </pre>
          {block.legend && block.legend.length > 0 ? (
            <div className="border-t bg-background/60 px-4 py-3">
              <p className="mb-2 text-sm font-semibold text-foreground">{block.legendHeading ?? ui.whereHeading}</p>
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(4rem,max-content)_1fr]">
                {block.legend.map((item) => (
                  <div key={item.symbol} className="contents">
                    <dt className="font-mono font-semibold text-foreground [overflow-wrap:anywhere]">{item.symbol}</dt>
                    <dd className="mb-1 leading-6 text-foreground/80 sm:mb-0"><DocsRichText text={item.meaning} /></dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </figure>
      );

    case "table":
      return (
        <figure className="min-w-0 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {block.columns.map((column) => <TableHead key={column} className="h-auto whitespace-nowrap py-2 font-semibold text-foreground">{column}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className="min-w-[6rem] align-top leading-6"><DocsRichText text={cell} /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {block.caption ? <figcaption className="border-t px-4 py-2 text-sm text-muted-foreground">{block.caption}</figcaption> : null}
        </figure>
      );

    case "callout": {
      const tone = TONE_STYLE[block.tone];
      const Icon = tone.icon;
      return (
        <aside className={cn("rounded-lg border p-4", tone.box)}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("gap-1 font-semibold", tone.badge)}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {ui.tones[block.tone]}
            </Badge>
            {block.heading ? <span className="font-semibold text-foreground">{block.heading}</span> : null}
          </div>
          {block.text ? <p className="leading-7 text-foreground/90"><DocsRichText text={block.text} /></p> : null}
          {block.items ? (
            <ul className="mt-1 list-disc space-y-1 pl-5 leading-7 text-foreground/90">
              {block.items.map((item, index) => <li key={index}><DocsRichText text={item} /></li>)}
            </ul>
          ) : null}
        </aside>
      );
    }

    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag className={cn("space-y-2 pl-5 leading-7 text-foreground/90", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, index) => <li key={index} className="pl-1"><DocsRichText text={item} /></li>)}
        </ListTag>
      );
    }

    case "example":
      return (
        <section className="rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-4 dark:border-blue-800 dark:bg-blue-950/10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200">
              <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
              {ui.exampleBadge}
            </Badge>
            <span className="font-semibold text-foreground">{block.heading}</span>
          </div>
          <DocsBlocks blocks={block.blocks} sectionId={sectionId} />
        </section>
      );

    case "sources":
      return <DocsSourcesList ids={block.ids} text={block.text} />;

    case "glossary":
      return <DocsGlossary entries={block.entries} sectionId={sectionId} />;

    case "bibliography":
      return <DocsBibliography groups={block.groups} sectionId={sectionId} />;
  }
}
