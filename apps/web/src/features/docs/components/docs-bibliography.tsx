import { BadgeCheck, CircleHelp, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import { DOCS_SECTIONS, docsPath, docsSourceAnchor, type DocsSectionId } from "../docs-section-ids";
import { DOCS_SOURCES, type DocsSource, type DocsSourceId } from "../docs-sources";
import type { DocsBibliographyGroup } from "../docs.types";
import { fillTemplate, useDocsContext } from "./docs-context";
import { CopyLinkButton, DocsAnchorHeading } from "./docs-heading";
import { DocsRichText } from "./docs-rich-text";

/** Short list of the sources used by one section, linking to the bibliography. */
export function DocsSourcesList({ ids, text }: { ids: DocsSourceId[]; text?: string }) {
  const { ui } = useDocsContext();
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{ui.sourcesHeading}</h2>
      {text ? <p className="mb-2 text-sm leading-6"><DocsRichText text={text} /></p> : null}
      <ul className="space-y-2 text-sm leading-6">
        {ids.map((id) => {
          const source = DOCS_SOURCES[id];
          return (
            <li key={id} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <Link
                to={docsPath(DOCS_SECTIONS.references, docsSourceAnchor(id))}
                className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700 dark:text-blue-300 dark:decoration-blue-700"
              >
                {source.shortCite}
              </Link>
              <span className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{source.work}</span>
              {source.verification.status === "unverified" ? <UnverifiedBadge /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Full bibliography grouped by role in the method. */
export function DocsBibliography({ groups, sectionId }: { groups: DocsBibliographyGroup[]; sectionId: DocsSectionId }) {
  const sources = Object.values(DOCS_SOURCES);
  return (
    <div className="space-y-8">
      {groups.map((group) => {
        const members = sources.filter((source) => source.role === group.role);
        if (members.length === 0) return null;
        return (
          <section key={group.role} className="space-y-3">
            <DocsAnchorHeading as="h2" id={`role-${group.role}`} path={docsPath(sectionId, `role-${group.role}`)} className="text-xl font-semibold tracking-tight text-foreground">
              {group.heading}
            </DocsAnchorHeading>
            {group.intro ? <p className="leading-7 text-foreground/80"><DocsRichText text={group.intro} /></p> : null}
            <ol className="space-y-3">
              {members.map((source) => <BibliographyEntry key={source.id} source={source} sectionId={sectionId} />)}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function BibliographyEntry({ source, sectionId }: { source: DocsSource; sectionId: DocsSectionId }) {
  const { ui, language } = useDocsContext();
  const anchor = docsSourceAnchor(source.id);
  const year = source.year === null ? "n.d." : String(source.year);
  const verified = source.verification.status === "verified";

  return (
    <li id={anchor} tabIndex={-1} className="scroll-mt-[calc(var(--app-header-height)+1.5rem)] rounded-lg border bg-card p-4 focus:outline-none target:ring-2 target:ring-blue-400 focus-visible:ring-2 focus-visible:ring-ring">
      <p className="leading-7 text-foreground [overflow-wrap:anywhere]">
        {source.authors} ({year}). <em className="font-medium">{source.work}</em>. {source.venue}.{" "}
        <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700 dark:text-blue-300 dark:decoration-blue-700">
          {source.doi ? `doi:${source.doi}` : source.url}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </a>
      </p>
      <dl className="mt-3 grid gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="font-semibold text-muted-foreground">{ui.roleInMethod}</dt>
        <dd className="leading-6 text-foreground/90">{source.roleNote[language]}</dd>
        <dt className="font-semibold text-muted-foreground">{ui.reliability}</dt>
        <dd className="leading-6 text-foreground/90">
          <span className="font-medium">{ui.sourceKinds[source.kind]}</span>
          {source.reliabilityNote ? <span>. {source.reliabilityNote[language]}</span> : null}
        </dd>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {verified ? (
          <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {fillTemplate(ui.verifiedVia, { method: source.verification.method, date: source.verification.checkedOn })}
          </Badge>
        ) : <UnverifiedBadge />}
        <CopyLinkButton path={docsPath(sectionId, anchor)} className="ml-auto" />
      </div>
      {source.verification.note ? <p className={cn("mt-2 text-sm leading-6", verified ? "text-muted-foreground" : "text-rose-800 dark:text-rose-200")}>{source.verification.note[language]}</p> : null}
    </li>
  );
}

function UnverifiedBadge() {
  const { ui } = useDocsContext();
  return (
    <Badge variant="outline" className="gap-1 border-rose-300 bg-rose-50 font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
      <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      {ui.unverified}
    </Badge>
  );
}
