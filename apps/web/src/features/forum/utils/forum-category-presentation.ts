import {
  BarChart3,
  BookOpen,
  Brain,
  Code2,
  Database,
  FlaskConical,
  type LucideIcon,
  Shield,
} from "lucide-react";

/**
 * The six forum categories have a small, stable visual vocabulary. Keeping the
 * mapping here means list rows, category headers and the sidebar do not each
 * invent a different icon or accent for the same category.
 *
 * `tone` is intentionally semantic rather than a raw colour. The forum theme
 * can style the `forum-category-*--<tone>` hooks with its light/dark OKLCH
 * values without coupling this data helper to a particular colour palette.
 */
export type ForumCategoryTone =
  | "software-engineering"
  | "artificial-intelligence"
  | "data-science"
  | "cybersecurity"
  | "information-systems"
  | "research-methodology"
  | "general-research";

export type ForumCategoryPresentation = {
  icon: LucideIcon;
  tone: ForumCategoryTone;
  /** Class hooks for category icons in compact navigation and metadata. */
  iconClassName: string;
  /** Class hooks for category banners and larger context surfaces. */
  accentClassName: string;
  /** Class hooks for the small category square/marker used beside titles. */
  markerClassName: string;
};

const presentation = (icon: LucideIcon, tone: ForumCategoryTone): ForumCategoryPresentation => ({
  icon,
  tone,
  iconClassName: `forum-category-icon forum-category-icon--${tone}`,
  accentClassName: `forum-category-accent forum-category-accent--${tone}`,
  markerClassName: `forum-category-marker forum-category-marker--${tone}`,
});

/** Shared presentation tokens for the built-in public forum categories. */
export const FORUM_CATEGORY_PRESENTATIONS: Readonly<Record<ForumCategoryTone, ForumCategoryPresentation>> = {
  "software-engineering": presentation(Code2, "software-engineering"),
  "artificial-intelligence": presentation(Brain, "artificial-intelligence"),
  "data-science": presentation(BarChart3, "data-science"),
  cybersecurity: presentation(Shield, "cybersecurity"),
  "information-systems": presentation(Database, "information-systems"),
  "research-methodology": presentation(FlaskConical, "research-methodology"),
  "general-research": presentation(BookOpen, "general-research"),
};

/**
 * Return the visual treatment for a category slug, falling back to the
 * neutral General Research treatment for custom or missing categories.
 */
export function getForumCategoryPresentation(slug?: string | null): ForumCategoryPresentation {
  const normalized = slug?.trim().toLowerCase() as ForumCategoryTone | undefined;
  return (normalized && FORUM_CATEGORY_PRESENTATIONS[normalized]) || FORUM_CATEGORY_PRESENTATIONS["general-research"];
}

// Short alias for call sites that already use the noun-first vocabulary.
export const forumCategoryPresentation = getForumCategoryPresentation;
