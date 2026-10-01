import * as React from "react";
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
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import type { ForumMarkdownAction, ForumTableConfig } from "../utils/forum-discussion-editor";

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
  onTableInsert?: (config: ForumTableConfig) => void;
  className?: string;
  disabled?: boolean;
  canQuotePost?: boolean;
}

export function ForumFormattingToolbar({ onAction, onTableInsert, className, disabled = false, canQuotePost = false }: ForumFormattingToolbarProps) {
  const { t } = useI18n();
  const [tableOpen, setTableOpen] = React.useState(false);
  const [tableRows, setTableRows] = React.useState(2);
  const [tableColumns, setTableColumns] = React.useState(3);
  const [includeHeader, setIncludeHeader] = React.useState(true);
  const [headers, setHeaders] = React.useState([t("Title"), t("References"), t("Notes")]);

  const openTableBuilder = () => {
    setTableRows(2);
    setTableColumns(3);
    setIncludeHeader(true);
    setHeaders([t("Title"), t("References"), t("Notes")]);
    setTableOpen(true);
  };
  const submitTable = () => {
    const config = { rows: Math.max(1, Math.min(20, tableRows)), columns: Math.max(1, Math.min(8, tableColumns)), includeHeader, headers } satisfies ForumTableConfig;
    if (onTableInsert) onTableInsert(config);
    else onAction("table");
    setTableOpen(false);
  };
  const previewColumns = Math.max(1, Math.min(8, tableColumns));

  return (
    <>
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
            <DropdownMenuItem key={action} disabled={disabled} onSelect={() => action === "table" ? openTableBuilder() : onAction(action)} className="min-h-11 gap-3">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span>{t(label)}</span>
              {shortcut ? <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="ml-auto hidden px-2 text-xs text-muted-foreground sm:inline">Markdown</span>
    </div>
    <Dialog open={tableOpen} onOpenChange={setTableOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Insert table")}</DialogTitle>
          <DialogDescription>{t("Choose the table size and edit column labels before inserting it into your discussion.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium"><span>{t("Rows")}</span><Input type="number" min={1} max={20} value={tableRows} onChange={(event) => setTableRows(Number(event.target.value) || 1)} /></label>
            <label className="space-y-1.5 text-sm font-medium"><span>{t("Columns")}</span><Input type="number" min={1} max={8} value={tableColumns} onChange={(event) => setTableColumns(Number(event.target.value) || 1)} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeHeader} onChange={(event) => setIncludeHeader(event.target.checked)} className="h-4 w-4 accent-primary" /><span>{t("Use first row as header")}</span></label>
          <div>
            <p className="mb-2 text-sm font-medium">{t("Column labels")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: previewColumns }, (_, index) => <Input key={index} aria-label={`${t("Column")} ${index + 1}`} value={headers[index] ?? `${t("Column")} ${index + 1}`} onChange={(event) => setHeaders((current) => { const next = [...current]; next[index] = event.target.value; return next; })} maxLength={80} />)}
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border border-border bg-muted/20 p-3" aria-label={t("Table preview")}>
            <table className="min-w-full border-collapse text-xs"><thead><tr>{Array.from({ length: previewColumns }, (_, index) => <th key={index} className="border border-border bg-background px-2 py-1 text-left font-medium">{headers[index] || `${t("Column")} ${index + 1}`}</th>)}</tr></thead><tbody>{Array.from({ length: Math.min(3, Math.max(1, tableRows)) }, (_, row) => <tr key={row}>{Array.from({ length: previewColumns }, (_, column) => <td key={column} className="border border-border px-2 py-2 text-muted-foreground">{row === 0 && column === 0 ? t("text") : " "}</td>)}</tr>)}</tbody></table>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => setTableOpen(false)}>{t("Cancel")}</Button>
          <Button type="button" onClick={submitTable}>{t("Insert table")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
