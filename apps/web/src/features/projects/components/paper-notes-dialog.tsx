import { useState, useEffect, type ChangeEvent } from "react";
import { toast } from "sonner";
import { FileText, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateProjectPaper } from "../hooks/use-projects";

export function PaperNotesDialog({
  projectId,
  paperId,
  paperTitle,
  initialNotes,
  updatedAt,
  open,
  onClose,
  readOnly,
}: {
  projectId: string;
  paperId: string;
  paperTitle: string;
  initialNotes?: string | null;
  updatedAt?: string;
  open: boolean;
  onClose: () => void;
  readOnly: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const updatePaper = useUpdateProjectPaper(projectId);

  useEffect(() => {
    setNotes(initialNotes ?? "");
  }, [initialNotes, open]);

  const handleSave = async () => {
    if (readOnly) return;
    try {
      await updatePaper.mutateAsync({
        paperId,
        data: {
          notes: notes.trim() || null,
          expectedUpdatedAt: updatedAt,
        },
      });
      toast.success("Đã lưu ghi chú cho bài báo thành công.");
      onClose();
    } catch {
      toast.error("Không thể lưu ghi chú. Vui lòng thử lại.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !updatePaper.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg" data-no-i18n>
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary font-semibold text-xs mb-1">
            <FileText size={14} />
            <span>Ghi chú nghiên cứu</span>
          </div>
          <DialogTitle className="text-base font-bold leading-snug line-clamp-2">
            {paperTitle}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Ghi chú riêng của nhóm về phương pháp, phát hiện hoặc điểm cần lưu ý khi trích xuất minh chứng.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Nội dung ghi chú</span>
            <span className="text-muted-foreground font-normal">{notes.length} / 5000 ký tự</span>
          </label>
          <textarea
            value={notes}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
            placeholder="Nhập ghi chú quan trọng về bài báo này..."
            rows={6}
            maxLength={5000}
            disabled={readOnly || updatePaper.isPending}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={updatePaper.isPending}>
            Đóng
          </Button>
          {!readOnly && (
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={updatePaper.isPending}
              className="gap-1.5"
            >
              <Save size={14} />
              {updatePaper.isPending ? "Đang lưu..." : "Lưu ghi chú"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
