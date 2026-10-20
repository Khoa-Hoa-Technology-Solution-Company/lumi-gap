import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/utils/cn";
import { docsPath, type DocsSectionId } from "../docs-section-ids";
import type { ResolvedDocsGroup } from "../docs.types";
import { useDocsContext } from "./docs-context";

/** Grouped table of contents for wide screens. */
export function DocsSidebar({ groups, activeId }: { groups: ResolvedDocsGroup[]; activeId: DocsSectionId }) {
  const { ui } = useDocsContext();
  return (
    <nav aria-label={ui.tocHeading} className="space-y-5 text-sm">
      {groups.map((group) => (
        <div key={group.moduleId}>
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.groupHeading}</p>
          <ul className="space-y-0.5">
            {group.sections.map((section) => {
              const active = section.id === activeId;
              return (
                <li key={section.id}>
                  <NavLink
                    to={docsPath(section.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md border-l-2 px-2 py-1.5 leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-blue-600 bg-blue-50 font-semibold text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300"
                        : "border-transparent text-foreground/80 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {section.heading}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Native select for narrow screens: one tap, works with screen readers and keyboards. */
export function DocsMobileToc({ groups, activeId }: { groups: ResolvedDocsGroup[]; activeId: DocsSectionId }) {
  const { ui } = useDocsContext();
  const navigate = useNavigate();
  const selectId = useId();
  return (
    <div className="w-full min-w-0">
      <label htmlFor={selectId} className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ui.tocSelect}</label>
      <div className="relative">
        <select
          id={selectId}
          value={activeId}
          onChange={(event) => navigate(docsPath(event.target.value as DocsSectionId))}
          className="h-11 w-full min-w-0 appearance-none truncate rounded-md border border-input bg-background pl-3 pr-9 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {groups.map((group) => (
            <optgroup key={group.moduleId} label={group.groupHeading}>
              {group.sections.map((section) => <option key={section.id} value={section.id}>{section.heading}</option>)}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  );
}
