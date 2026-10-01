import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Camera, ImageMinus, Sparkles, Upload, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRemoveAcademicCover, useUploadAcademicCover } from "../hooks/use-academic-profile";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const PRESET_BANNERS = [
  {
    id: "deep-blue",
    name: "Deep Academic Blue",
    gradient: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0369a1 100%)",
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(0.5, "#1e3a8a");
      grad.addColorStop(1, "#0369a1");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // subtle grid pattern
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    },
  },
  {
    id: "cyber-indigo",
    name: "Cybernetic Indigo",
    gradient: "linear-gradient(135deg, #030712 0%, #312e81 60%, #4f46e5 100%)",
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#030712");
      grad.addColorStop(0.6, "#312e81");
      grad.addColorStop(1, "#4f46e5");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const rad = ctx.createRadialGradient(w * 0.8, h * 0.2, 10, w * 0.8, h * 0.2, 300);
      rad.addColorStop(0, "rgba(99, 102, 241, 0.4)");
      rad.addColorStop(1, "rgba(99, 102, 241, 0)");
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, w, h);
    },
  },
  {
    id: "emerald-research",
    name: "Emerald Research",
    gradient: "linear-gradient(135deg, #022c22 0%, #065f46 50%, #047857 100%)",
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#022c22");
      grad.addColorStop(0.5, "#065f46");
      grad.addColorStop(1, "#047857");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const rad = ctx.createRadialGradient(w * 0.2, h * 0.8, 10, w * 0.2, h * 0.8, 250);
      rad.addColorStop(0, "rgba(16, 185, 129, 0.35)");
      rad.addColorStop(1, "rgba(16, 185, 129, 0)");
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, w, h);
    },
  },
  {
    id: "cosmic-violet",
    name: "Cosmic Violet",
    gradient: "linear-gradient(135deg, #18002e 0%, #581c87 50%, #7e22ce 100%)",
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#18002e");
      grad.addColorStop(0.5, "#581c87");
      grad.addColorStop(1, "#7e22ce");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
  },
  {
    id: "minimal-slate",
    name: "Minimal Slate",
    gradient: "linear-gradient(135deg, #090d16 0%, #1e293b 70%, #334155 100%)",
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#090d16");
      grad.addColorStop(0.7, "#1e293b");
      grad.addColorStop(1, "#334155");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
  },
];

async function generatePresetFile(presetId: string): Promise<File> {
  const preset = PRESET_BANNERS.find((p) => p.id === presetId) ?? PRESET_BANNERS[0];
  if (!preset) throw new Error("Preset not found");
  const width = 1200;
  const height = 400;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser");
  preset.draw(context, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((val) => (val ? resolve(val) : reject(new Error("Could not create banner"))), "image/webp", 0.95),
  );
  return new File([blob], `cover-${preset.id}.webp`, { type: "image/webp" });
}

async function croppedCover(source: string, zoom: number, offsetX: number, offsetY: number): Promise<File> {
  const image = new Image();
  image.src = source;
  await image.decode();

  const targetWidth = 1200;
  const targetHeight = 400;
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image editor is unavailable in this browser");

  // Cover aspect fitting with zoom
  const scale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight) * zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;

  const overflowX = Math.max(0, drawWidth - targetWidth);
  const overflowY = Math.max(0, drawHeight - targetHeight);

  const x = (targetWidth - drawWidth) / 2 + (offsetX / 100) * (overflowX / 2);
  const y = (targetHeight - drawHeight) / 2 + (offsetY / 100) * (overflowY / 2);

  context.drawImage(image, x, y, drawWidth, drawHeight);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((val) => (val ? resolve(val) : reject(new Error("Could not crop cover image"))), "image/webp", 0.92),
  );
  return new File([blob], "profile-cover.webp", { type: "image/webp" });
}

export function ProfileCoverDialog({
  open,
  currentCover,
  onOpenChange,
}: {
  open: boolean;
  currentCover?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const upload = useUploadAcademicCover();
  const remove = useRemoveAcademicCover();

  const [activeMode, setActiveMode] = useState<"upload" | "gallery">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [error, setError] = useState("");
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const preview = objectUrl ?? currentCover ?? null;
  const dirty = Boolean(file) || Boolean(selectedPreset) || zoom !== 1 || offsetX !== 0 || offsetY !== 0;

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setSelectedPreset(null);
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      setError("");
      setActiveMode("upload");
      setDiscardDialogOpen(false);
    }
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
    if (!ACCEPTED_TYPES.has(next.type)) {
      setError(t("Choose a JPEG, PNG, or WebP image."));
      return;
    }
    if (next.size > MAX_FILE_SIZE) {
      setError(t("Cover image must be 10 MB or smaller."));
      return;
    }
    setSelectedPreset(null);
    setFile(next);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }

  function selectPreset(presetId: string) {
    setError("");
    setFile(null);
    setSelectedPreset(presetId);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }

  async function save() {
    setError("");
    try {
      if (selectedPreset) {
        const presetFile = await generatePresetFile(selectedPreset);
        await upload.mutateAsync(presetFile);
      } else if (file && objectUrl) {
        const cropped = await croppedCover(objectUrl, zoom, offsetX, offsetY);
        await upload.mutateAsync(cropped);
      } else {
        return;
      }
      toast.success(t("Cover photo updated"));
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Upload failed. Your selected image is still available to retry."));
    }
  }

  async function removeCurrent() {
    setError("");
    try {
      await remove.mutateAsync();
      toast.success(t("Cover photo removed"));
      onOpenChange(false);
    } catch {
      setError(t("Could not remove the cover photo. Please try again."));
    }
  }

  const selectedPresetObj = PRESET_BANNERS.find((p) => p.id === selectedPreset);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white sm:max-w-2xl dark:border-slate-800 dark:bg-[#101923]">
        <DialogHeader>
          <DialogTitle>{t("Change cover photo")}</DialogTitle>
          <DialogDescription>
            {t("Upload and reposition a wide banner for your academic profile.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Mode Switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setActiveMode("upload")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all",
                activeMode === "upload"
                  ? "bg-white text-blue-600 shadow-xs dark:bg-[#15202b] dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{t("Upload custom image")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode("gallery")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all",
                activeMode === "gallery"
                  ? "bg-white text-blue-600 shadow-xs dark:bg-[#15202b] dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
              )}
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              <span>{t("Choose from gallery")}</span>
            </button>
          </div>

          {/* Banner Live Preview Box */}
          <div className="relative aspect-[3/1] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-900 shadow-inner dark:border-slate-700">
            {selectedPresetObj ? (
              <div
                className="h-full w-full transition-all duration-300"
                style={{ background: selectedPresetObj.gradient }}
              />
            ) : preview ? (
              <img
                src={preview}
                alt="Profile cover preview"
                className="h-full w-full object-cover transition-transform duration-75 select-none pointer-events-none"
                style={{
                  transform: `translate(${offsetX * 0.4}px, ${offsetY * 0.4}px) scale(${zoom})`,
                }}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                <Camera className="h-10 w-10 opacity-50" />
                <span className="text-xs">{t("No cover photo selected")}</span>
              </div>
            )}

            {/* Reposition guide overlay if uploaded file */}
            {file && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-white/20 bg-black/10">
                <span className="rounded-full bg-slate-950/70 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md">
                  {t("Use sliders below to adjust zoom & position")}
                </span>
              </div>
            )}
          </div>

          {/* Mode 1: Upload File & Adjust Sliders */}
          {activeMode === "upload" && (
            <div className="space-y-4">
              <label className="block">
                <span className="sr-only">{t("Upload cover image")}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-50 file:px-4 file:py-2.5 file:text-xs file:font-bold file:text-blue-700 hover:file:bg-blue-100 dark:text-slate-300 dark:file:bg-blue-950/50 dark:file:text-blue-200"
                  onChange={(event) => choose(event.target.files?.[0])}
                />
              </label>

              {file && (
                <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-3 dark:border-white/5 dark:bg-white/[0.02]">
                  <Range
                    label={t("Zoom")}
                    icon={<ZoomIn className="h-3.5 w-3.5 text-blue-500" />}
                    min={1}
                    max={2.5}
                    step={0.05}
                    value={zoom}
                    onChange={setZoom}
                  />
                  <Range
                    label={t("Vertical position")}
                    min={-100}
                    max={100}
                    step={1}
                    value={offsetY}
                    onChange={setOffsetY}
                  />
                  <Range
                    label={t("Horizontal position")}
                    min={-100}
                    max={100}
                    step={1}
                    value={offsetX}
                    onChange={setOffsetX}
                  />
                </div>
              )}

              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t("JPEG, PNG, or WebP · maximum 10 MB · recommended 1200 × 400 px.")}
              </p>
            </div>
          )}

          {/* Mode 2: Curated Academic Gallery */}
          {activeMode === "gallery" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PRESET_BANNERS.map((preset) => {
                  const active = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => selectPreset(preset.id)}
                      className={cn(
                        "group relative aspect-[2.4/1] overflow-hidden rounded-xl border p-1 text-left transition-all",
                        active
                          ? "border-blue-500 ring-2 ring-blue-500/40 shadow-sm"
                          : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600",
                      )}
                    >
                      <div
                        className="h-full w-full rounded-lg"
                        style={{ background: preset.gradient }}
                      />
                      <span className="absolute bottom-2 left-2 rounded-md bg-slate-950/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                        {t(preset.name)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2">
          {currentCover && (
            <Button
              type="button"
              variant="outline"
              className="mr-auto gap-2 text-xs font-semibold text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/30"
              disabled={remove.isPending || upload.isPending}
              onClick={removeCurrent}
            >
              <ImageMinus className="h-3.5 w-3.5" />
              {t("Remove cover")}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => close(false)}>
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            className="rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700"
            disabled={(!file && !selectedPreset) || upload.isPending || remove.isPending}
            onClick={save}
          >
            {upload.isPending ? t("Saving…") : t("Save cover photo")}
          </Button>
        </DialogFooter>
      </DialogContent>
      <Dialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#101923]">
          <DialogHeader>
            <DialogTitle>{t("Discard changes?")}</DialogTitle>
            <DialogDescription>
              {t("Your selected cover image and crop adjustments will be lost.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setDiscardDialogOpen(false)}>
              {t("Keep editing")}
            </Button>
            <Button type="button" variant="destructive" onClick={discardChanges}>
              {t("Discard changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function Range({
  label,
  icon,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  icon?: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
      <span className="flex items-center gap-1">
        {icon}
        {label}
      </span>
      <input
        aria-label={label}
        type="range"
        className="w-full accent-blue-600"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
