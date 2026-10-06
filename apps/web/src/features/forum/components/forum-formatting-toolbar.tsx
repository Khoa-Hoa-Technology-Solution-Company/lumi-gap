import { useState } from "react";
import { BookOpen, Bold, CalendarClock, Code, FileCode2, ChevronRight, Italic, Link2, List, ListOrdered, MessageSquareQuote, Plus, NotebookPen, Quote, CheckSquare, Strikethrough, Minus, Table2, Heading1, Sigma, EyeOff, WrapText, Pilcrow, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { ForumTableBuilder } from "./forum-table-builder";
import type { ForumMarkdownAction, ForumTableConfig } from "../utils/forum-discussion-editor";

type ToolbarItem = { label: string; action: ForumMarkdownAction; icon: typeof Bold; shortcut?: string };
const textStyles: ToolbarItem[] = [
  { label: "Heading 1", action: "heading-1", icon: Heading1 }, { label: "Heading 2", action: "heading-2", icon: Heading1 },
  { label: "Heading 3", action: "heading-3", icon: Heading1 }, { label: "Heading 4", action: "heading-4", icon: Heading1 },
  { label: "Paragraph", action: "paragraph", icon: Pilcrow }, { label: "Small", action: "small", icon: Type },
];
const primaryItems: ToolbarItem[] = [
  { label: "Bold", action: "bold", icon: Bold, shortcut: "B" }, { label: "Italic", action: "italic", icon: Italic, shortcut: "I" },
  { label: "Link", action: "link", icon: Link2, shortcut: "K" },
  { label: "Quote", action: "quote", icon: Quote }, { label: "Bullet list", action: "bullet", icon: List },
  { label: "Numbered list", action: "numbered", icon: ListOrdered }, { label: "Inline code", action: "code", icon: Code },
];
const advancedItems: ToolbarItem[] = [
  { label: "Insert table", action: "table", icon: Table2 }, { label: "Add citation", action: "citation", icon: BookOpen }, { label: "Add footnote", action: "footnote", icon: NotebookPen },
  { label: "Insert math", action: "math", icon: Sigma },
  { label: "Code block", action: "code-block", icon: FileCode2 }, { label: "Insert date/time", action: "date", icon: CalendarClock, shortcut: "Ctrl Shift ." },
  { label: "Insert note", action: "callout", icon: MessageSquareQuote }, { label: "Hide details", action: "details", icon: ChevronRight },
  { label: "Blur spoiler", action: "spoiler", icon: EyeOff }, { label: "Apply wrap", action: "wrap", icon: WrapText },
  { label: "Checklist", action: "checklist", icon: CheckSquare }, { label: "Strikethrough", action: "strikethrough", icon: Strikethrough },
  { label: "Horizontal rule", action: "divider", icon: Minus },
];
interface ForumFormattingToolbarProps {
  onAction: (action: ForumMarkdownAction) => void;
  onTableInsert?: (config: ForumTableConfig) => boolean | void;
  getTable?: () => ForumTableConfig | undefined;
  className?: string; disabled?: boolean; canQuotePost?: boolean;
  activeActions?: ForumMarkdownAction[];
}
export function ForumFormattingToolbar({ onAction, onTableInsert, getTable, className, disabled = false, canQuotePost = false, activeActions = [] }: ForumFormattingToolbarProps) {
  const { t } = useI18n();
  const [tableOpen, setTableOpen] = useState(false);
  const [initialTable, setInitialTable] = useState<ForumTableConfig>();
  return <>
    <div className={`flex min-w-0 flex-wrap items-center gap-0.5 ${className ?? ""}`} role="toolbar" aria-label={t("Formatting")}>
      {primaryItems.map(({ label, action, icon: Icon, shortcut }) => <Button key={action} type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-background hover:text-foreground aria-pressed:bg-accent aria-pressed:text-primary" aria-label={t(label)} aria-pressed={activeActions.includes(action)} title={`${t(label)}${shortcut ? ` (Ctrl+${shortcut})` : ""}`} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => onAction(action)}><Icon aria-hidden className="h-4 w-4" /></Button>)}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-background hover:text-foreground data-[state=open]:bg-accent" aria-label={t("Text style")} title={t("Text style")} disabled={disabled}><Type aria-hidden className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-48 bg-background text-foreground" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">{t("Text style")}</DropdownMenuLabel><DropdownMenuSeparator />
          {textStyles.map(({ label, action, icon: Icon }) => <DropdownMenuItem key={action} disabled={disabled} onSelect={() => onAction(action)} className="min-h-11 gap-3"><Icon aria-hidden className="h-4 w-4 text-muted-foreground" /><span>{t(label)}</span></DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 bg-muted text-foreground hover:bg-accent data-[state=open]:bg-accent" aria-label={t("More formatting")} title={t("More formatting")} disabled={disabled}><Plus aria-hidden className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="max-h-80 w-[min(20rem,calc(100vw-2rem))] bg-background text-foreground" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">{t("More formatting")}</DropdownMenuLabel><DropdownMenuSeparator />
          {canQuotePost ? <DropdownMenuItem disabled={disabled} onSelect={() => onAction("quote-post")} className="min-h-11 gap-3"><Quote aria-hidden className="h-4 w-4 text-muted-foreground" />{t("Quote whole post")}</DropdownMenuItem> : null}
          {advancedItems.map(({ label, action, icon: Icon, shortcut }) => <DropdownMenuItem key={action} disabled={disabled} onSelect={() => { if (action === "table") { setInitialTable(getTable?.()); setTableOpen(true); } else onAction(action); }} className="min-h-11 gap-3"><Icon aria-hidden className="h-4 w-4 text-muted-foreground" /><span>{t(label)}</span>{shortcut ? <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut> : null}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {tableOpen ? <ForumTableBuilder initial={initialTable} onInsert={(config) => onTableInsert ? onTableInsert(config) : onAction("table")} onClose={() => setTableOpen(false)} /> : null}
  </>;
}
