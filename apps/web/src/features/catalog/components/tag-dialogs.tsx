import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { TagDetail } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { useCreateTag, useUpdateTag } from "../hooks/use-tags";
import { apiErr, slugify } from "./catalog-ui";

const TEXTAREA_CLASS =
  "min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const DEFAULT_COLOR = "#3b82f6";

export const RETAG_TOAST = "Tag saved. Papers are being re-tagged in the background.";

function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <label htmlFor="tag-color" className="text-sm font-medium">{t("Color")}</label>
      <div className="flex items-center gap-2">
        <input
          id="tag-color"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
        />
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
    </div>
  );
}

export function CreateTagDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? <CreateTagForm onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateTagForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const create = useCreateTag();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const tag = await create.mutateAsync({
        name: name.trim(),
        ...(effectiveSlug ? { slug: effectiveSlug } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        color,
      });
      toast.success(t(RETAG_TOAST));
      onClose();
      navigate(`/admin/tags/${tag.id}`);
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <DialogHeader className="text-left">
        <DialogTitle>{t("New tag")}</DialogTitle>
        <DialogDescription>{t("Create the tag first, then add rules on its page to decide which papers get it.")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <label htmlFor="tag-name" className="text-sm font-medium">{t("Name")} <span className="text-destructive">*</span></label>
        <Input id="tag-name" value={name} maxLength={200} required autoFocus onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tag-slug" className="text-sm font-medium">{t("Slug")}</label>
        <Input
          id="tag-slug"
          value={effectiveSlug}
          maxLength={120}
          onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)); }}
        />
        <p className="text-xs text-muted-foreground">{t("Lowercase words joined by hyphens. Generated from the name until you edit it.")}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tag-description" className="text-sm font-medium">{t("Description")}</label>
        <textarea
          id="tag-description"
          className={TEXTAREA_CLASS}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <ColorField value={color} onChange={setColor} />

      <DialogFooter className="gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {create.isPending ? t("Creating…") : t("Create tag")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditTagDialog({ tag, open, onOpenChange }: {
  tag: TagDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? <EditTagForm tag={tag} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditTagForm({ tag, onClose }: { tag: TagDetail; onClose: () => void }) {
  const { t } = useI18n();
  const update = useUpdateTag();
  const [name, setName] = useState(tag.name);
  const [description, setDescription] = useState(tag.description ?? "");
  const [color, setColor] = useState(tag.color ?? DEFAULT_COLOR);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync({
        id: tag.id,
        input: { name: name.trim(), description: description.trim() || null, color },
      });
      toast.success(t("Tag saved."));
      onClose();
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <DialogHeader className="text-left">
        <DialogTitle>{t("Edit tag")}</DialogTitle>
        <DialogDescription>{t("The slug stays the same so existing links keep working.")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <label htmlFor="edit-tag-name" className="text-sm font-medium">{t("Name")}</label>
        <Input id="edit-tag-name" value={name} maxLength={200} required onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="edit-tag-description" className="text-sm font-medium">{t("Description")}</label>
        <textarea
          id="edit-tag-description"
          className={TEXTAREA_CLASS}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <ColorField value={color} onChange={setColor} />

      <DialogFooter className="gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
        <Button type="submit" disabled={!name.trim() || update.isPending}>
          {update.isPending ? t("Saving…") : t("Save changes")}
        </Button>
      </DialogFooter>
    </form>
  );
}
