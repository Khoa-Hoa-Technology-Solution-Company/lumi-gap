import {
  Bold,
  CalendarClock,
  Code,
  FileCode2,
  ChevronRight,
  Hash,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquareQuote,
  Plus,
  NotebookPen,
  Quote,
  CheckSquare,
  Strikethrough,
  Minus,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import type { ForumMarkdownAction } from "../utils/forum-discussion-editor";

type ToolbarItem = {
  label: string;
  action: ForumMarkdownAction;
  icon: typeof Bold;
  shortcut?: string;
};

const primaryItems: ToolbarItem[] = [
  { label: "Bold", action: "bold", icon: Bold, shortcut: "B" },
  { label: "Italic", action: "italic", icon: Italic, shortcut: "I" },
  { label: "Heading", action: "heading", icon: Hash },
  { label: "Link", action: "link", icon: Link2, shortcut: "K" },
  { label: "Quote", action: "quote", icon: Quote },
  { label: "Bullet list", action: "bullet", icon: List },
  { label: "Numbered list", action: "numbered", icon: ListOrdered },
  { label: "Inline code", action: "code", icon: Code },
];

const advancedItems: ToolbarItem[] = [
  { label: "Code block", action: "code-block", icon: FileCode2 },
  { label: "Insert table", action: "table", icon: Table2 },
  { label: "Insert date/time", action: "date", icon: CalendarClock, shortcut: "Ctrl Shift ." },
  { label: "Add footnote", action: "footnote", icon: NotebookPen },
  { label: "Insert note", action: "callout", icon: MessageSquareQuote },
  { label: "Details note", action: "details", icon: ChevronRight },
  { label: "Checklist", action: "checklist", icon: CheckSquare },
  { label: "Strikethrough", action: "strikethrough", icon: Strikethrough },
  { label: "Horizontal rule", action: "divider", icon: Minus },
];

interface ForumFormattingToolbarProps {
  onAction: (action: ForumMarkdownAction) => void;
  className?: string;
  disabled?: boolean;
  canQuotePost?: boolean;
}

export function ForumFormattingToolbar({ onAction, className, disabled = false, canQuotePost = false }: ForumFormattingToolbarProps) {
  const { t } = useI18n();

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-0.5 ${className ?? ""}`} role="toolbar" aria-label={t("Formatting")}>
      {primaryItems.map(({ label, action, icon: Icon, shortcut }) => (
        <Button
          key={action}
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-background hover:text-foreground"
          aria-label={t(label)}
          title={`${t(label)}${shortcut ? ` (Ctrl+${shortcut})` : ""}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(action)}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 bg-muted text-foreground hover:bg-accent data-[state=open]:bg-accent"
            aria-label={t("More formatting")}
            title={t("More formatting")}
            disabled={disabled}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="max-h-80 w-[min(20rem,calc(100vw-2rem))] bg-background text-foreground" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
            {t("More formatting")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {canQuotePost ? <DropdownMenuItem disabled={disabled} onSelect={() => onAction("quote-post")} className="min-h-11 gap-3"><Quote className="h-4 w-4 text-muted-foreground" /><span>{t("Quote whole post")}</span></DropdownMenuItem> : null}
          {advancedItems.map(({ label, action, icon: Icon, shortcut }) => (
            <DropdownMenuItem key={action} disabled={disabled} onSelect={() => onAction(action)} className="min-h-11 gap-3">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span>{t(label)}</span>
              {shortcut ? <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="ml-auto hidden px-2 text-xs text-muted-foreground sm:inline">Markdown</span>
    </div>
  );
}
