import { useEffect, useMemo } from "react";
import { ArrowLeft, ArrowRight, BookOpenText } from "lucide-react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { DOCS_BASE_PATH, docsPath, type DocsSectionId } from "../docs-section-ids";
import { DEFAULT_DOCS_SECTION, getDocsGroups, getDocsUi, resolveDocsLanguage } from "../docs-registry";
import { DocsBlocks } from "./docs-blocks";
import { DocsContext, type DocsRenderContext } from "./docs-context";
import { DocsAnchorHeading } from "./docs-heading";
import { DocsRichText } from "./docs-rich-text";
import { DocsMobileToc, DocsSidebar } from "./docs-sidebar";

/** /docs and /docs/:sectionId. One section per URL; in-section anchors via #hash. */
export function DocsPage() {
  const { sectionId } = useParams<{ sectionId?: string }>();
  const { language: uiLanguage } = useI18n();
  const location = useLocation();

  const language = resolveDocsLanguage(uiLanguage);
  const groups = useMemo(() => getDocsGroups(uiLanguage), [uiLanguage]);
  const sections = useMemo(() => groups.flatMap((group) => group.sections), [groups]);
  const context = useMemo<DocsRenderContext>(() => ({
    language,
    ui: getDocsUi(uiLanguage),
    sectionHeadings: Object.fromEntries(sections.map((section) => [section.id, section.heading])) as Partial<Record<DocsSectionId, string>>,
  }), [language, uiLanguage, sections]);

  const activeIndex = sections.findIndex((section) => section.id === sectionId);
  const section = activeIndex >= 0 ? sections[activeIndex] : undefined;
  const previous = activeIndex > 0 ? sections[activeIndex - 1] : undefined;
  const next = activeIndex >= 0 && activeIndex < sections.length - 1 ? sections[activeIndex + 1] : undefined;

  useEffect(() => {
    if (!section) return;
    const previousTitle = document.title;
    document.title = `${section.heading} · ${context.ui.pageHeading} · LumiGap`;
    return () => {
      document.title = previousTitle;
    };
  }, [section, context.ui.pageHeading]);

  // Scroll to the #anchor after the section renders, or to the top on a new section.
  useEffect(() => {
    if (!section) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    const frame = window.requestAnimationFrame(() => {
      const target = hash ? document.getElementById(hash) : null;
      if (target) {
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        target.focus({ preventScroll: true });
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [section, location.hash]);

  if (!sectionId) return <Navigate to={docsPath(DEFAULT_DOCS_SECTION)} replace />;

  const ui = context.ui;
  const subheadings = section?.body.flatMap((block) => (block.kind === "heading" ? [block] : [])) ?? [];
  const activeId = (section?.id ?? DEFAULT_DOCS_SECTION) as DocsSectionId;

  return (
    <DocsContext.Provider value={context}>
      <div data-no-i18n lang={language} className="mx-auto w-full min-w-0 max-w-6xl">
        <header className="mb-6 flex min-w-0 items-start gap-3 border-b pb-5">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <BookOpenText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-bold tracking-tight text-foreground">{ui.pageHeading}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{ui.pageIntro}</p>
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:block">
            <div className="sticky top-[calc(var(--app-header-height)+1.5rem)] max-h-[calc(100dvh-var(--app-header-height)-3rem)] overflow-y-auto overscroll-contain pb-6 pr-1">
              <p className="mb-3 px-2 text-sm font-semibold text-foreground">{ui.tocHeading}</p>
              <DocsSidebar groups={groups} activeId={activeId} />
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-6 lg:hidden">
              <DocsMobileToc groups={groups} activeId={activeId} />
            </div>

            {section ? (
              <article className="min-w-0" aria-labelledby={`docs-${section.id}`}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">{section.groupHeading}</p>
                <DocsAnchorHeading as="h1" id={`docs-${section.id}`} path={docsPath(section.id)} className="text-3xl font-bold tracking-tight text-foreground">
                  {section.heading}
                </DocsAnchorHeading>
                {section.summary ? <p className="mt-3 text-lg leading-8 text-muted-foreground"><DocsRichText text={section.summary} /></p> : null}

                {subheadings.length >= 2 ? (
                  <nav aria-label={ui.inThisSection} className="mt-5 rounded-lg border bg-muted/30 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ui.inThisSection}</p>
                    <ul className="grid gap-1 text-sm sm:grid-cols-2">
                      {subheadings.map((heading) => (
                        <li key={heading.id} className="min-w-0">
                          <Link to={docsPath(section.id, heading.id)} className="block truncate rounded px-1 py-0.5 text-blue-700 hover:underline dark:text-blue-300">
                            {heading.text}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ) : null}

                <div className="mt-6">
                  <DocsBlocks blocks={section.body} sectionId={section.id} />
                </div>

                <nav aria-label={`${ui.previous} / ${ui.next}`} className="mt-10 grid gap-3 border-t pt-6 sm:grid-cols-2">
                  {previous ? (
                    <Link to={docsPath(previous.id)} className="group flex min-w-0 flex-col rounded-lg border p-4 transition hover:border-blue-300 hover:bg-muted/40 dark:hover:border-blue-800">
                      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        {ui.previous}
                      </span>
                      <span className="mt-1 truncate font-medium text-foreground group-hover:text-blue-700 dark:group-hover:text-blue-300">{previous.heading}</span>
                    </Link>
                  ) : <span className="hidden sm:block" />}
                  {next ? (
                    <Link to={docsPath(next.id)} className="group flex min-w-0 flex-col items-end rounded-lg border p-4 text-right transition hover:border-blue-300 hover:bg-muted/40 dark:hover:border-blue-800">
                      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {ui.next}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="mt-1 max-w-full truncate font-medium text-foreground group-hover:text-blue-700 dark:group-hover:text-blue-300">{next.heading}</span>
                    </Link>
                  ) : null}
                </nav>
              </article>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-foreground">{ui.sectionNotFound}</p>
                <Link to={DOCS_BASE_PATH} className="mt-3 inline-block font-medium text-blue-700 underline underline-offset-2 dark:text-blue-300">{ui.backToStart}</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </DocsContext.Provider>
  );
}
