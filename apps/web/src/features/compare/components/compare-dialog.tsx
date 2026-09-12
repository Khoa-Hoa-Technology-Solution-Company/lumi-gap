import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePapers } from "@/features/papers/hooks/use-papers";
import { useComparePapers } from "../hooks/use-compare";
import { CompareTable } from "./compare-table";
import {
  Loader2,
  Search,
  Plus,
  X,
  ChevronLeft,
  Sparkles,
  Calendar,
  Users,
  AlertCircle,
} from "lucide-react";
import type { Paper } from "@trend/shared-types";

interface CompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPaper: Paper;
}

export function CompareDialog({ open, onOpenChange, currentPaper }: CompareDialogProps) {
  // Trạng thái màn hình: 'picker' (chọn bài báo) hoặc 'result' (kết quả so sánh)
  const [viewMode, setViewMode] = useState<"picker" | "result">("picker");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedPapers, setSelectedPapers] = useState<Paper[]>([]);

  // Debounce ô tìm kiếm để tránh gọi API liên tục
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Gọi API tìm kiếm bài viết
  const { data: searchResults, isLoading: isSearching } = usePapers({
    q: debouncedQuery || undefined,
    pageSize: 5,
  });

  // Tạo mảng IDs để truyền vào hook so sánh (gồm bài hiện tại + các bài đã chọn)
  const comparePaperIds = [currentPaper.id, ...selectedPapers.map((p) => p.id)];

  // Gọi hook so sánh (chỉ active khi ở chế độ 'result')
  const {
    data: comparisonData,
    isLoading: isComparing,
    isError: isCompareError,
    error: compareError,
  } = useComparePapers(viewMode === "result" ? comparePaperIds : []);

  // Xử lý thêm bài viết vào danh sách so sánh
  const handleAddPaper = (paper: Paper) => {
    // Không cho chọn lại bài viết hiện tại
    if (paper.id === currentPaper.id) return;
    // Không cho chọn trùng bài viết
    if (selectedPapers.some((p) => p.id === paper.id)) return;
    // Giới hạn chọn tối đa 3 bài viết thêm
    if (selectedPapers.length >= 3) return;

    setSelectedPapers([...selectedPapers, paper]);
  };

  // Xử lý xóa bài viết khỏi danh sách so sánh
  const handleRemovePaper = (paperId: string) => {
    setSelectedPapers(selectedPapers.filter((p) => p.id !== paperId));
  };

  // Reset trạng thái khi đóng dialog
  useEffect(() => {
    if (!open) {
      setViewMode("picker");
      setSearchQuery("");
      setSelectedPapers([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto rounded-2xl p-6 transition-all duration-300 dark:bg-[#0c0d12] dark:border-slate-800 ${viewMode === "result" ? "md:p-8" : ""
        }`}>
        {viewMode === "picker" ? (
          /* --- MÀN HÌNH CHỌN BÀI BÁO (PICKER) --- */
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                Comparing scientific articles
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
                Select up to 3 papers to analyze quantitative metrics and perform qualitative comparison using AI.
              </DialogDescription>
            </DialogHeader>

            {/* Bài viết hiện tại (Cố định ở vị trí đầu tiên) */}
            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 rounded-xl p-4">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                Current Paper (Original)
              </span>
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm line-clamp-1">
                {currentPaper.title}
              </h4>
              <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                {currentPaper.authors.map((a) => a.displayName).join(", ")}
              </p>
            </div>

            {/* Các bài viết đã chọn thêm */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Comparison List ({selectedPapers.length}/3 additional papers)
                </span>
                {selectedPapers.length >= 3 && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    Reached comparison limit
                  </span>
                )}
              </div>

              {selectedPapers.length === 0 ? (
                <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400 bg-slate-50/20">
                  No papers selected. Search below to add papers to the comparison list.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {selectedPapers.map((paper) => (
                    <div
                      key={paper.id}
                      className="flex items-start justify-between gap-2 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-xl p-3 relative group"
                    >
                      <div className="min-w-0">
                        <h5 className="font-bold text-slate-800 dark:text-slate-200 text-xs line-clamp-1 leading-snug">
                          {paper.title}
                        </h5>
                        <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                          {paper.authors.map((a) => a.displayName).join(", ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove paper from comparison"
                        onClick={() => handleRemovePaper(paper.id)}
                        className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-full p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Search Section */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Search Papers
              </span>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  placeholder="Enter paper title, author, or keyword to search..."
                  className="pl-9 h-10 bg-slate-50/50 focus-visible:ring-indigo-500 dark:bg-slate-900/30 dark:border-slate-800"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Kết quả tìm kiếm */}
              <div className="space-y-2 mt-2 max-h-60 overflow-y-auto pr-1">
                {isSearching ? (
                  <div className="flex items-center justify-center py-8 text-xs text-slate-500 gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    Searching for papers...
                  </div>
                ) : debouncedQuery && searchResults?.papers.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 border border-slate-100 dark:border-slate-900 rounded-xl">
                    No matching papers found.
                  </div>
                ) : (
                  (searchResults?.papers || [])
                    .filter((p) => p.id !== currentPaper.id) // Loại bài viết hiện tại
                    .map((paper) => {
                      const isAdded = selectedPapers.some((p) => p.id === paper.id);
                      return (
                        <div
                          key={paper.id}
                          className="flex items-center justify-between gap-4 p-3 rounded-xl border border-slate-100 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-all group"
                        >
                          <div className="min-w-0">
                            <h5 className="font-bold text-slate-800 dark:text-slate-200 text-xs line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {paper.title}
                            </h5>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
                              <span className="flex items-center gap-0.5">
                                <Users className="w-3 h-3" />
                                {paper.authors && paper.authors.length > 0
                                  ? (paper.authors[0]?.displayName || "") + (paper.authors.length > 1 ? " et al." : "")
                                  : "N/A"}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-0.5">
                                <Calendar className="w-3 h-3" />
                                {paper.publicationYear}
                              </span>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant={isAdded ? "secondary" : "outline"}
                            className={`h-7 px-3 text-xs font-semibold gap-1 rounded-lg shrink-0 ${isAdded
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600"
                              : "text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
                              }`}
                            onClick={() => handleAddPaper(paper)}
                            disabled={isAdded || selectedPapers.length >= 3}
                          >
                            <Plus className="w-3 h-3" /> Add
                          </Button>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-900">
              <Button
                variant="ghost"
                className="h-10 text-slate-600 dark:text-slate-400 font-semibold"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 rounded-lg shadow-sm"
                disabled={selectedPapers.length === 0}
                onClick={() => setViewMode("result")}
              >
                Compare ({selectedPapers.length + 1} papers)
              </Button>
            </div>
          </div>
        ) : (
          /* --- MÀN HÌNH HIỂN THỊ KẾT QUẢ SO SÁNH --- */
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-900">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-lg text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800"
                  onClick={() => setViewMode("picker")}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">
                    Analysis & Comparison Results
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cross-comparing {comparePaperIds.length} scientific papers
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close"
                className="h-9 w-9 rounded-lg text-slate-400 hover:text-slate-600"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {isComparing ? (
              <div className="py-24 flex flex-col items-center justify-center gap-4 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Analyzing and comparing papers with AI...
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    The qualitative analysis by the LLM model may take 1-3 seconds to load if not cached.
                  </p>
                </div>
              </div>
            ) : isCompareError ? (
              <div className="py-12 px-6 border border-red-100 dark:border-red-950/30 rounded-2xl bg-red-50/30 dark:bg-red-950/10 flex flex-col items-center justify-center text-center gap-3 max-w-xl mx-auto">
                <AlertCircle className="w-10 h-10 text-red-500" />
                <h4 className="font-bold text-red-800 dark:text-red-400 text-sm">
                  An error occurred during comparison
                </h4>
                <p className="text-xs text-red-600 dark:text-red-500/80 leading-relaxed">
                  {compareError instanceof Error ? compareError.message : "The backend API returned an unknown error."}
                </p>
                <Button
                  variant="outline"
                  className="mt-2 text-xs font-semibold text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-100/30"
                  onClick={() => setViewMode("picker")}
                >
                  Go back and edit selection
                </Button>
              </div>
            ) : comparisonData ? (
              /* Render bảng so sánh khi có data */
              <div className="space-y-4">
                <CompareTable comparison={comparisonData} />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                  AI comparison uses structured paper knowledge when available, with abstract fallback.
                </p>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-900">
                  <Button
                    variant="outline"
                    className="h-10 text-slate-700 dark:text-slate-300 font-semibold border-slate-200 dark:border-slate-800 rounded-lg"
                    onClick={() => setViewMode("picker")}
                  >
                    Edit comparison list
                  </Button>
                  <Button
                    className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 rounded-lg shadow-sm"
                    onClick={() => onOpenChange(false)}
                  >
                    Close comparison
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
