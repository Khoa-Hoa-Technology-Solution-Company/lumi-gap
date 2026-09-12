import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  ShieldCheck,
  Download,
  Languages,
  Clock,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { papersApi } from "@/features/papers/api/papers.api";
import { useCreditBalance } from "@/features/credits";

const CRITERION_LABELS: Record<string, { vi: string; en: string }> = {
  scientific_quality: {
    vi: "Chất lượng khoa học",
    en: "Scientific Quality",
  },
  originality: {
    vi: "Tính nguyên bản / Mới",
    en: "Originality",
  },
  quality_of_writing: {
    vi: "Chất lượng trình bày",
    en: "Quality of Writing",
  },
  topical_suitability: {
    vi: "Phù hợp chủ đề",
    en: "Topical Suitability",
  },
  completeness_of_references: {
    vi: "Tài liệu tham khảo",
    en: "Completeness of References",
  },
  innovation_potential: {
    vi: "Tiềm năng đổi mới",
    en: "Innovation Potential",
  },
  implementation_viability: {
    vi: "Khả năng triển khai",
    en: "Implementation Viability",
  },
  personal_expertise: {
    vi: "Am hiểu của Reviewer",
    en: "Reviewer Expertise",
  },
};

function parseNumericScore(item: any): number | null {
  if (typeof item === "number" && !isNaN(item)) return item;
  if (typeof item === "object" && item !== null && item.score !== undefined) {
    const num = Number(item.score);
    return isNaN(num) ? null : num;
  }
  if (typeof item === "string" && item.trim() !== "") {
    const num = Number(item);
    return isNaN(num) ? null : num;
  }
  return null;
}

export function PaperReviewPage() {
  const [file, setFile] = useState<File | null>(null);
  const [strictness, setStrictness] = useState<"lenient" | "balanced" | "strict">("balanced");
  const [usePersonalKey, setUsePersonalKey] = useState(false);
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [currentReview, setCurrentReview] = useState<any>(null);

  const { data: balanceData, refetch: refetchBalance } = useCreditBalance();
  const credits = balanceData?.credits ?? 0;

  const { data: history, refetch: refetchHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ["paper-reviews-history"],
    queryFn: () => papersApi.listReviews(),
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Vui lòng chọn file PDF bài báo");
      return papersApi.submitReview(file, strictness, usePersonalKey);
    },
    onSuccess: (data) => {
      toast.success("Thẩm định bài báo hoàn tất!");
      setCurrentReview(data);
      refetchBalance();
      refetchHistory();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || "Quá trình thẩm định thất bại";
      toast.error(msg);
    },
  });

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === "application/pdf") {
      setFile(dropped);
    } else {
      toast.error("Chỉ chấp nhận file PDF");
    }
  };

  const getRecommendationBadge = (rec: string) => {
    switch (rec) {
      case "Strong Accept":
      case "Accept":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-base px-3 py-1">{rec}</Badge>;
      case "Borderline":
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-base px-3 py-1">{rec}</Badge>;
      case "Reject":
      case "Strong Reject":
        return <Badge className="bg-rose-600 hover:bg-rose-700 text-white text-base px-3 py-1">{rec}</Badge>;
      default:
        return <Badge variant="outline">{rec}</Badge>;
    }
  };

  const getStrengths = (): string[] => {
    const br = currentReview?.bilingualReview;
    if (!br) return [];
    if (lang === "vi") {
      if (Array.isArray(br.strengths_vi) && br.strengths_vi.length > 0) return br.strengths_vi;
      if (Array.isArray(br.strengths)) {
        return br.strengths.map((s: any) => (typeof s === "string" ? s : s?.vi || s?.en || "")).filter(Boolean);
      }
      if (Array.isArray(br.strengths_en)) return br.strengths_en;
    } else {
      if (Array.isArray(br.strengths_en) && br.strengths_en.length > 0) return br.strengths_en;
      if (Array.isArray(br.strengths)) {
        return br.strengths.map((s: any) => (typeof s === "string" ? s : s?.en || s?.vi || "")).filter(Boolean);
      }
      if (Array.isArray(br.strengths_vi)) return br.strengths_vi;
    }
    return [];
  };

  const getWeaknesses = (): string[] => {
    const br = currentReview?.bilingualReview;
    if (!br) return [];
    if (lang === "vi") {
      if (Array.isArray(br.changes_vi) && br.changes_vi.length > 0) return br.changes_vi;
      if (Array.isArray(br.weaknesses_vi) && br.weaknesses_vi.length > 0) return br.weaknesses_vi;
      if (Array.isArray(br.weaknesses)) {
        return br.weaknesses.map((w: any) => (typeof w === "string" ? w : w?.vi || w?.en || "")).filter(Boolean);
      }
      if (Array.isArray(br.changes_en)) return br.changes_en;
    } else {
      if (Array.isArray(br.changes_en) && br.changes_en.length > 0) return br.changes_en;
      if (Array.isArray(br.weaknesses_en) && br.weaknesses_en.length > 0) return br.weaknesses_en;
      if (Array.isArray(br.weaknesses)) {
        return br.weaknesses.map((w: any) => (typeof w === "string" ? w : w?.en || w?.vi || "")).filter(Boolean);
      }
      if (Array.isArray(br.changes_vi)) return br.changes_vi;
    }
    return [];
  };

  const getSummaryText = (): string => {
    const br = currentReview?.bilingualReview;
    if (!br) return "";
    if (typeof br.summary === "string") return br.summary;
    if (typeof br.summary === "object" && br.summary !== null) {
      return (lang === "vi" ? br.summary.vi || br.summary.en : br.summary.en || br.summary.vi) || "";
    }
    return "";
  };

  const getTpcRemarks = (): string => {
    const br = currentReview?.bilingualReview;
    if (!br) return "";
    if (typeof br.tpc === "string") return br.tpc;
    if (typeof br.tpc === "object" && br.tpc !== null) {
      return (lang === "vi" ? br.tpc.vi || br.tpc.en : br.tpc.en || br.tpc.vi) || "";
    }
    return "";
  };

  const numericScores = currentReview?.scores
    ? Object.entries(currentReview.scores).filter(([key, val]) => {
        if (key === "journal_publication" || key === "overall_recommendation") return false;
        return parseNumericScore(val) !== null;
      })
    : [];

  const journalRecommendation = currentReview?.scores?.journal_publication;
  const strengths = getStrengths();
  const weaknesses = getWeaknesses();
  const summaryText = getSummaryText();
  const tpcRemarks = getTpcRemarks();

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              AI Scientific Paper Reviewer
            </h1>
            <Badge variant="secondary" className="gap-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
              <Sparkles className="h-3.5 w-3.5" /> Gemini 2.0
            </Badge>
          </div>
          <p className="text-slate-500 mt-2">
            Phản biện và thẩm định chuyên sâu bài báo khoa học chuẩn TPC / Hội nghị song ngữ Anh - Việt
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg px-4 py-2 border text-right">
            <span className="text-xs text-slate-500 block font-medium">Số dư ví</span>
            <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{credits} Credits</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Upload & Controls */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="h-5 w-5 text-indigo-500" /> Tải lên bài báo
              </CardTitle>
              <CardDescription>File PDF tối đa 50MB</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                  file
                    ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50 dark:bg-slate-900/50"
                }`}
                onClick={() => document.getElementById("pdf-upload")?.click()}
              >
                <input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
                />
                {file ? (
                  <div className="flex flex-col items-center">
                    <FileText className="h-10 w-10 text-emerald-600 mb-2" />
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate max-w-xs">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    <span className="text-xs text-indigo-600 mt-2 hover:underline">Nhấn để đổi file</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="h-10 w-10 text-slate-400 mb-2" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Kéo thả file PDF vào đây hoặc bấm để chọn
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Hỗ trợ đầy đủ các format IEEE, ACM, Springer...</p>
                  </div>
                )}
              </div>

              {/* Strictness selector */}
              <div>
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Mức độ khắt khe (Strictness)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["lenient", "balanced", "strict"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStrictness(s)}
                      className={`py-2 px-3 text-xs font-semibold rounded-lg border capitalize transition-all ${
                        strictness === s
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {s === "lenient" ? "Khoan dung" : s === "balanced" ? "Cân bằng" : "Nghiêm ngặt"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Personal key toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/50">
                <div className="pr-2">
                  <span className="text-xs font-semibold block text-slate-800 dark:text-slate-200">Dùng Gemini Key cá nhân</span>
                  <span className="text-[11px] text-slate-500">Chỉ tốn 3 credit / lần review</span>
                </div>
                <input
                  type="checkbox"
                  checked={usePersonalKey}
                  onChange={(e) => setUsePersonalKey(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              {/* Cost notice & Submit Button */}
              <div className="pt-2">
                <div className="flex justify-between text-xs text-slate-500 mb-3">
                  <span>Phí thực hiện:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {usePersonalKey ? "3 Credits" : "10 Credits"}
                  </span>
                </div>

                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-5"
                  disabled={!file || reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate()}
                >
                  {reviewMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Đang thẩm định AI (15-30s)...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" /> Bắt đầu thẩm định
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* History widget */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" /> Lịch sử thẩm định gần đây
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <p className="text-xs text-slate-500">Đang tải lịch sử...</p>
              ) : history && history.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {history.map((h: any) => (
                    <div
                      key={h._id}
                      onClick={async () => {
                        const full = await papersApi.getReviewById(h._id);
                        setCurrentReview(full);
                      }}
                      className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <div className="truncate pr-2">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{h.fileName}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{new Date(h.createdAt).toLocaleDateString("vi-VN")}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {h.recommendation || h.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Chưa có bài báo nào được thẩm định.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Review Report View */}
        <div className="lg:col-span-8">
          {currentReview ? (
            <div className="space-y-6">
              {/* Recommendation Banner */}
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 bg-gradient-to-r from-indigo-900/10 via-slate-50 to-slate-100 dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b">
                  <div>
                    <span className="text-xs uppercase tracking-wider font-bold text-slate-500">Kết quả đánh giá</span>
                    <div className="flex items-center gap-3 mt-1">
                      {getRecommendationBadge(currentReview.recommendation)}
                      <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                        Cấp độ: <span className="capitalize font-semibold">{currentReview.strictness}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLang(lang === "vi" ? "en" : "vi")}
                      className="gap-1.5"
                    >
                      <Languages className="h-4 w-4" />
                      {lang === "vi" ? "Đổi sang Tiếng Anh" : "Switch to Vietnamese"}
                    </Button>
                  </div>
                </div>

                <CardContent className="pt-6">
                  {/* Paper profile (title, authors) if available */}
                  {currentReview.profile?.title && (
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 mb-6">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-1">
                        {lang === "vi" ? "Bài báo được thẩm định" : "Manuscript Profile"}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                        {currentReview.profile.title}
                      </h3>
                      {currentReview.profile.authors && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {lang === "vi" ? "Tác giả:" : "Authors:"}
                          </span>{" "}
                          {currentReview.profile.authors}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Summary if available */}
                  {summaryText && (
                    <div className="p-4 rounded-xl border border-indigo-100 dark:border-indigo-950/60 bg-indigo-50/40 dark:bg-indigo-950/20 mb-6">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                        {lang === "vi" ? "Tóm tắt đánh giá (Summary)" : "Review Summary"}
                      </h4>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {summaryText}
                      </p>
                    </div>
                  )}

                  {/* Scores Grid */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      {lang === "vi"
                        ? "Điểm số tiêu chí khoa học (Thang điểm 1 - 5)"
                        : "Scientific Evaluation Criteria (Scale 1 - 5)"}
                    </h3>
                    {journalRecommendation && (
                      <Badge
                        variant="secondary"
                        className={`text-xs px-2.5 py-0.5 font-semibold w-fit ${
                          journalRecommendation === "Yes"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {lang === "vi"
                          ? `Xuất bản tạp chí: ${journalRecommendation === "Yes" ? "Khuyến nghị" : "Không"}`
                          : `Journal Publication: ${journalRecommendation}`}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {numericScores.map(([key, rawVal]) => {
                      const scoreVal = parseNumericScore(rawVal);
                      const labelObj = CRITERION_LABELS[key];
                      const mainLabel = labelObj
                        ? lang === "vi"
                          ? labelObj.vi
                          : labelObj.en
                        : key.replace(/_/g, " ");
                      const subLabel = labelObj && lang === "vi" ? labelObj.en : null;

                      return (
                        <div
                          key={key}
                          className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/70 flex flex-col justify-between shadow-sm transition-all hover:border-indigo-300 dark:hover:border-indigo-700"
                        >
                          <div>
                            <span className="text-xs text-slate-800 dark:text-slate-200 font-bold block leading-tight">
                              {mainLabel}
                            </span>
                            {subLabel && (
                              <span className="text-[10px] text-slate-400 block mt-0.5 font-normal truncate">
                                {subLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline justify-between mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-baseline">
                              <span className="text-2xl font-black text-slate-900 dark:text-white">
                                {scoreVal !== null ? scoreVal : "—"}
                              </span>
                              <span className="text-xs font-semibold text-slate-400 ml-0.5">/5</span>
                            </div>
                            {scoreVal !== null ? (
                              scoreVal >= 4 ? (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                  {lang === "vi" ? "Tốt" : "Good"}
                                </span>
                              ) : scoreVal === 3 ? (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                                  {lang === "vi" ? "Trung bình" : "Average"}
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                                  {lang === "vi" ? "Cần cải thiện" : "Needs Work"}
                                </span>
                              )
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Strengths and Weaknesses */}
                  {(strengths.length > 0 || weaknesses.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                      <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20">
                        <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 mb-2">
                          <CheckCircle2 className="h-4 w-4" />{" "}
                          {lang === "vi" ? "Điểm mạnh nổi bật (Strengths)" : "Key Strengths"}
                        </h4>
                        {strengths.length > 0 ? (
                          <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                            {strengths.map((item: string, i: number) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-emerald-600 font-bold shrink-0">•</span>
                                <span className="leading-relaxed">{item}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-400 italic">
                            {lang === "vi" ? "Chưa có thông tin điểm mạnh" : "No strengths listed"}
                          </p>
                        )}
                      </div>

                      <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20">
                        <h4 className="text-sm font-bold text-rose-800 dark:text-rose-300 flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4" />{" "}
                          {lang === "vi" ? "Điểm hạn chế cần khắc phục (Weaknesses)" : "Recommended Changes / Weaknesses"}
                        </h4>
                        {weaknesses.length > 0 ? (
                          <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                            {weaknesses.map((item: string, i: number) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-rose-600 font-bold shrink-0">•</span>
                                <span className="leading-relaxed">{item}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-400 italic">
                            {lang === "vi" ? "Chưa có đề xuất chỉnh sửa" : "No changes recommended"}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TPC Remarks if available */}
                  {tpcRemarks && (
                    <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                        {lang === "vi" ? "Ghi chú gửi Ban chương trình (TPC Member)" : "Confidential Remarks for TPC Member"}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 italic leading-relaxed">
                        {tpcRemarks}
                      </p>
                    </div>
                  )}

                  {/* Detailed Critique Markdown */}
                  {currentReview.reportMarkdown && (
                    <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
                        {lang === "vi"
                          ? "Báo cáo phản biện chi tiết (Comprehensive Review Report)"
                          : "Comprehensive Scientific Review Report"}
                      </h3>
                      <div className="prose prose-slate dark:prose-invert max-w-none text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {currentReview.reportMarkdown}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="h-full min-h-[400px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <Sparkles className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Chưa chọn bài báo</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Tải lên file PDF và bắt đầu thẩm định hoặc chọn một báo cáo từ lịch sử để xem chi tiết.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
