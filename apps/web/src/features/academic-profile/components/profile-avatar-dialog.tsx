import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Camera, ImageMinus, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRemoveAcademicAvatar, useUploadAcademicAvatar } from "../hooks/use-academic-profile";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function croppedAvatar(source: string, zoom: number, offsetX: number, offsetY: number): Promise<File> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image editor is unavailable in this browser");
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const overflowX = Math.max(0, width - size);
  const overflowY = Math.max(0, height - size);
  const x = (size - width) / 2 + (offsetX / 100) * (overflowX / 2);
  const y = (size - height) / 2 + (offsetY / 100) * (overflowY / 2);
  context.drawImage(image, x, y, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not crop image")), "image/webp", 0.9));
  return new File([blob], "profile-photo.webp", { type: "image/webp" });
}

export function ProfileAvatarDialog({ open, currentAvatar, onOpenChange }: { open: boolean; currentAvatar?: string | null; onOpenChange: (open: boolean) => void }) {
  const upload = useUploadAcademicAvatar();
  const remove = useRemoveAcademicAvatar();
  const [file, setFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [error, setError] = useState("");
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const objectUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  const preview = objectUrl ?? currentAvatar ?? null;
  const dirty = Boolean(file) || zoom !== 1 || offsetX !== 0 || offsetY !== 0;

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  useEffect(() => {
    if (!open) { setFile(null); setZoom(1); setOffsetX(0); setOffsetY(0); setError(""); setDiscardDialogOpen(false); }
  }, [open]);

  function close(next: boolean) {
    if (!next && dirty && !upload.isSuccess) {
      setDiscardDialogOpen(true);
      return;
    }
    onOpenChange(next);
  }

  function discardChanges() {
    setDiscardDialogOpen(false);
    onOpenChange(false);
  }

  function choose(next: File | undefined) {
    setError("");
    if (!next) return;
    if (!ACCEPTED_TYPES.has(next.type)) { setError("Choose a JPEG, PNG, or WebP image."); return; }
    if (next.size > MAX_FILE_SIZE) { setError("Profile photo must be 5 MB or smaller."); return; }
    setFile(next); setZoom(1); setOffsetX(0); setOffsetY(0);
  }

  async function save() {
    if (!file || !objectUrl) return;
    setError("");
    try {
      await upload.mutateAsync(await croppedAvatar(objectUrl, zoom, offsetX, offsetY));
      toast.success("Profile photo updated");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed. Your selected photo is still available to retry.");
    }
  }

  async function removeCurrent() {
    setError("");
    try {
      await remove.mutateAsync();
      toast.success("Profile photo removed");
      onOpenChange(false);
    } catch {
      setError("Could not remove the profile photo. Please try again.");
    }
  }

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white sm:max-w-xl dark:border-slate-800 dark:bg-[#101923]">
      <DialogHeader>
        <DialogTitle>Change profile photo</DialogTitle>
        <DialogDescription>Upload, crop, and position a square photo. The final image is safely normalized before storage.</DialogDescription>
      </DialogHeader>
      <div className="space-y-5">
        <div className="mx-auto flex h-64 w-64 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          {preview ? <img src={preview} alt="Profile photo crop preview" className="h-full w-full object-cover" style={{ transform: `translate(${offsetX * 0.35}px, ${offsetY * 0.35}px) scale(${zoom})` }} /> : <Camera className="h-10 w-10 text-slate-400" />}
        </div>
        <label className="block">
          <span className="sr-only">Upload profile photo</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:text-slate-300 dark:file:bg-blue-950/50 dark:file:text-blue-200" onChange={(event) => choose(event.target.files?.[0])} />
        </label>
        {file && <div className="grid gap-4 sm:grid-cols-3">
          <Range label="Zoom" icon={<ZoomIn className="h-3.5 w-3.5" />} min={1} max={2.5} step={0.05} value={zoom} onChange={setZoom} />
          <Range label="Horizontal" min={-100} max={100} step={1} value={offsetX} onChange={setOffsetX} />
          <Range label="Vertical" min={-100} max={100} step={1} value={offsetY} onChange={setOffsetY} />
        </div>}
        <p className="text-xs leading-5 text-slate-500">JPEG, PNG, or WebP · maximum 5 MB · minimum 128 × 128 px.</p>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
      </div>
      <DialogFooter className="gap-2">
        {currentAvatar && <Button type="button" variant="outline" className="mr-auto gap-2 text-red-700" disabled={remove.isPending || upload.isPending} onClick={removeCurrent}><ImageMinus className="h-4 w-4" />Remove photo</Button>}
        <Button type="button" variant="ghost" onClick={() => close(false)}>Cancel</Button>
        <Button type="button" disabled={!file || upload.isPending || remove.isPending} onClick={save}>{upload.isPending ? "Saving…" : "Save photo"}</Button>
      </DialogFooter>
    </DialogContent>
    <Dialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
      <DialogContent className="max-w-sm rounded-2xl border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#101923]">
        <DialogHeader>
          <DialogTitle>Discard changes?</DialogTitle>
          <DialogDescription>Your selected photo and crop adjustments will be lost.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => setDiscardDialogOpen(false)}>Keep editing</Button>
          <Button type="button" variant="destructive" onClick={discardChanges}>Discard changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Dialog>;
}

function Range({ label, icon, value, onChange, min, max, step }: { label: string; icon?: ReactNode; value: number; onChange: (value: number) => void; min: number; max: number; step: number }) {
  return <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"><span className="flex items-center gap-1">{icon}{label}</span><input aria-label={label} type="range" className="w-full accent-blue-700" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
