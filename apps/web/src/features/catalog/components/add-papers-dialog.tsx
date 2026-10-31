import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { Paper } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { papersApi } from "@/features/papers/api/papers.api";
import { useI18n } from "@/i18n";
import { useAddTagPapers } from "../hooks/use-tags";
import { AsyncPicker } from "./async-picker";
import { apiErr } from "./catalog-ui";

type PickedPaper = Pick<Paper, "id" | "title" | "publicationYear">;

async function searchPapers(query: string): Promise<PickedPaper[]> {
  const { papers } = await papersApi.list({ q: query || undefined, pageSize: 10 });
  return papers;
}

export function AddPapersDialog({ tagId, tagName, open, onOpenChange }: {
  tagId: string;
  tagName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const addPapers = useAddTagPapers();
  const [picked, setPicked] = useState<PickedPaper[]>([]);

  function close(next: boolean) {
    if (!next) setPicked([]);
    onOpenChange(next);
  }

  function toggle(paper: PickedPaper) {
    setPicked((current) =>
      current.some((item) => item.id === paper.id)
        ? current.filter((item) => item.id !== paper.id)
        : [...current, { id: paper.id, title: paper.title, publicationYear: paper.publicationYear }],
    );
  }

  async function submit() {
    try {
      const result = await addPapers.mutateAsync({ id: tagId, paperIds: picked.map((paper) => paper.id) });
      toast.success(t("{{count}} papers added to this tag.", { count: result.length || picked.length }));
      close(false);
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="text-left">
          <DialogTitle>{t("Add papers to “{{name}}”", { name: tagName })}</DialogTitle>
          <DialogDescription>
            {t("Papers added by hand stay tagged even when the rules no longer match them.")}
          </DialogDescription>
        </DialogHeader>

        <AsyncPicker<PickedPaper>
          label={t("Search papers")}
          placeholder={t("Search papers by title or keyword…")}
          cacheKey="tag-add-papers"
          keepOpen
          fetcher={searchPapers}
          getKey={(paper) => paper.id}
          isSelected={(paper) => picked.some((item) => item.id === paper.id)}
          onSelect={toggle}
          renderOption={(paper) => (
            <span className="flex items-start gap-2">
              <input
                type="checkbox"
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                checked={picked.some((item) => item.id === paper.id)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span className="min-w-0 flex-1 break-words">{paper.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{paper.publicationYear}</span>
            </span>
          )}
        />

        <div className="min-h-[3rem] space-y-1.5">
          <p className="text-sm font-medium">{t("Selected papers ({{count}})", { count: picked.length })}</p>
          {picked.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nothing selected yet.")}</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {picked.map((paper) => (
                <li key={paper.id} className="flex items-start gap-2 rounded-md bg-muted px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 break-words">{paper.title}</span>
                  <button
                    type="button"
                    aria-label={t("Remove {{value}}", { value: paper.title })}
                    className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    onClick={() => toggle(paper)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => close(false)}>{t("Cancel")}</Button>
          <Button type="button" disabled={picked.length === 0 || addPapers.isPending} onClick={submit}>
            {addPapers.isPending ? t("Adding…") : t("Add papers")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
