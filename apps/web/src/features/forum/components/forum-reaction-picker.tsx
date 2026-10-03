import { useRef, type KeyboardEvent } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import type { ForumReactionName, ForumReactionTarget, ForumReactionUser } from "../api/forum.api";
import { ForumReactorsPopover } from "./forum-reactors-popover";
import { FORUM_REACTIONS } from "../utils/forum-reactions";

export { FORUM_REACTIONS } from "../utils/forum-reactions";

interface ForumReactionPickerProps {
  counts?: Record<ForumReactionName, number>;
  viewerReactions?: ForumReactionName[];
  reactionUsers?: Partial<Record<ForumReactionName, ForumReactionUser[]>>;
  isAuthed: boolean;
  disabled?: boolean;
  pending?: boolean;
  onToggle: (reaction: ForumReactionName, active: boolean) => void;
  countsOnly?: boolean;
  triggerOnly?: boolean;
  target?: ForumReactionTarget;
}

export function ForumReactionPicker({ counts, viewerReactions, reactionUsers = {}, isAuthed, disabled = false, pending = false, onToggle, countsOnly = false, triggerOnly = false, target }: ForumReactionPickerProps) {
  const { t } = useI18n();
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const safeCounts = counts ?? { LIKE: 0, INSIGHTFUL: 0, CELEBRATE: 0, CURIOUS: 0, LOVE: 0, LAUGH: 0, SURPRISED: 0, SAD: 0, AGREE: 0, DISAGREE: 0 };
  const selected = FORUM_REACTIONS.find((reaction) => reaction.value === viewerReactions?.[0]);
  const isSelected = (reaction: ForumReactionName) => selected?.value === reaction;
  const canReact = isAuthed && !disabled && !pending;
  const visible = FORUM_REACTIONS.filter((reaction) => safeCounts[reaction.value] > 0);
  const total = visible.reduce((sum, reaction) => sum + safeCounts[reaction.value], 0);
  const navigateGrid = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const columns = 5;
    let next = index;
    if (event.key === "ArrowRight") next = Math.floor(index / columns) * columns + (index + 1) % columns;
    else if (event.key === "ArrowLeft") next = Math.floor(index / columns) * columns + (index + columns - 1) % columns;
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") next = (index + columns) % FORUM_REACTIONS.length;
    else return;
    event.preventDefault();
    event.stopPropagation();
    itemRefs.current[next]?.focus();
  };
  const titleFor = (reaction: ForumReactionName) => {
    const names = reactionUsers[reaction]?.map((user) => user.fullName).filter(Boolean) ?? [];
    return names.length ? `${names.join(", ")}${(safeCounts[reaction] ?? 0) > names.length ? ` +${(safeCounts[reaction] ?? 0) - names.length}` : ""}` : t("No reactions yet");
  };
  return (
    <div className="forum-reactions inline-flex min-w-0 flex-wrap items-center gap-1" data-mode={countsOnly ? "counts" : triggerOnly ? "trigger" : "all"} aria-label={t("Reactions")}>
      {!triggerOnly ? visible.map((reaction) => <ForumReactorsPopover key={reaction.value} target={target} counts={safeCounts} users={reactionUsers} initialFilter={reaction.value} trigger={<span aria-hidden="true">{reaction.emoji}</span>} triggerLabel={`${t(reaction.label)} ${safeCounts[reaction.value]}. ${t("Who reacted")}`} title={`${t(reaction.label)} · ${titleFor(reaction.value)}`} triggerClassName={cn("forum-reaction-chip inline-flex h-8 w-6 items-center justify-center rounded text-base transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isSelected(reaction.value) ? "bg-primary/10 text-primary" : "text-muted-foreground")} />) : null}
      {!triggerOnly && total > 0 ? <ForumReactorsPopover target={target} counts={safeCounts} users={reactionUsers} trigger={total} triggerLabel={`${t("Reactions")} ${total}`} title={t("Who reacted")} triggerClassName="ml-1 rounded text-sm tabular-nums text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" /> : null}
      {!countsOnly ? <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-busy={pending} aria-label={t(selected ? "Change reaction" : "Add reaction")} title={selected ? `${t("Your reaction")}: ${t(selected.label)}` : t("Add reaction")} className={cn("forum-reaction-trigger ml-auto h-9 w-9 text-muted-foreground", selected && "text-rose-600 dark:text-rose-400")}>
            {selected ? <span key={selected.value} aria-hidden="true" className="forum-selected-reaction">{selected.emoji}</span> : <Heart aria-hidden="true" className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} collisionPadding={12} aria-label={t("Choose a reaction")} className="forum-reaction-popover">
          <DropdownMenuLabel className="sr-only">{t("Choose a reaction")}</DropdownMenuLabel>
          <div className="forum-reaction-grid" role="group" aria-label={t("Available reactions")}>
            {FORUM_REACTIONS.map((reaction, index) => (
              <DropdownMenuItem
                key={reaction.value}
                ref={(element) => { itemRefs.current[index] = element; }}
                disabled={!canReact}
                role="menuitemradio"
                aria-checked={isSelected(reaction.value)}
                aria-label={`${t(reaction.label)}${safeCounts[reaction.value] ? ` · ${safeCounts[reaction.value]}` : ""}`}
                title={t(reaction.label)}
                onKeyDown={(event) => navigateGrid(event, index)}
                onSelect={() => { if (canReact) onToggle(reaction.value, !isSelected(reaction.value)); }}
                className={cn("forum-reaction-emoji-item", isSelected(reaction.value) && "is-active")}
              >
                <span aria-hidden="true" className="forum-reaction-emoji">{reaction.emoji}</span>
                {safeCounts[reaction.value] > 0 ? <span aria-hidden="true" className="forum-reaction-count">{safeCounts[reaction.value]}</span> : null}
              </DropdownMenuItem>
            ))}
          </div>
          <p className="forum-reaction-note">{t(!isAuthed ? "Sign in to react to this discussion." : disabled ? "This discussion is read-only." : "Choose one reaction. Select it again to remove it.")}</p>
        </DropdownMenuContent>
      </DropdownMenu> : null}
    </div>
  );
}
