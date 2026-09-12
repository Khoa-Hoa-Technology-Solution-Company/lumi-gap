import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FileCheck2,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Sliders,
  FileText,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { papersApi } from "@/features/papers/api/papers.api";

export function FormatCheckerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState("IEEE Conference · A4");
  const [currentResult, setCurrentResult] = useState<any>(null);

  const { data: presets } = useQuery({
    queryKey: ["format-presets"],
    queryFn: () => papersApi.getFormatPresets(),
  });

  const { data: history, refetch: refetchHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ["format-checks-history"],
    queryFn: () => papersApi.listFormatChecks(),
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Vui lòng chọn file PDF cần kiểm tra định dạng");
      return papersApi.checkFormat(file, preset);
    },
    onSuccess: (data) => {
      toast.success("Kiểm tra định dạng hoàn tất!");
      setCurrentResult(data);
      refetchHistory();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || "Kiểm tra định dạng thất bại";
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8 border-b pb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Kiểm tra chuẩn định dạng bài báo (Format Checker)
          </h1>
          <Badge variant="secondary" className="gap-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
            <FileCheck2 className="h-3.5 w-3.5" /> Chuẩn IEEE / Springer
          </Badge>
        </div>
        <p className="text-slate-500 mt-2">
          Đo lường chính xác kích thước trang, lề (margins), số cột, và phông chữ của bản thảo khoa học
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Upload & Preset */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="h-5 w-5 text-emerald-500" /> Tải lên bản thảo
              </CardTitle>
              <CardDescription>File PDF bài báo cần kiểm tra</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                  file
                    ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-slate-300 dark:border-slate-700 hover:border-emerald-400 bg-slate-50 dark:bg-slate-900/50"
                }`}
                onClick={() => document.getElementById("pdf-format-upload")?.click()}
              >
                <input
                  id="pdf-format-upload"
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
                    <span className="text-xs text-emerald-600 mt-2 hover:underline">Nhấn để đổi file</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="h-10 w-10 text-slate-400 mb-2" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Kéo thả file PDF vào đây hoặc bấm để chọn
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Hỗ trợ đo lường lề, font, cột chi tiết</p>
                  </div>
                )}
              </div>

              {/* Preset selection */}
              <div>
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Quy chuẩn hội nghị / tạp chí
                </label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {presets && presets.length > 0 ? (
                    presets.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="IEEE Conference · A4">IEEE Conference · A4</option>
                      <option value="IEEE Conference · US Letter">IEEE Conference · US Letter</option>
                      <option value="Springer LNCS">Springer LNCS</option>
                    </>
                  )}
                </select>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-5"
                  disabled={!file || checkMutation.isPending}
                  onClick={() => checkMutation.mutate()}
                >
                  {checkMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Đang đo đạc thông số PDF...
                    </>
                  ) : (
                    <>
                      <Sliders className="mr-2 h-4 w-4" /> Kiểm tra định dạng ngay
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
                <Clock className="h-4 w-4 text-slate-500" /> Lịch sử kiểm tra gần đây
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
                      onClick={() => setCurrentResult(h)}
                      className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <div className="truncate pr-2">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{h.fileName}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{h.preset}</p>
                      </div>
                      <Badge variant={h.passed ? "secondary" : "outline"} className={`text-[10px] shrink-0 ${h.passed ? "bg-emerald-100 text-emerald-800" : "text-rose-600"}`}>
                        {h.passed ? "Đạt" : "Cần sửa"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Chưa có bài báo nào được kiểm tra.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Format Check Report */}
        <div className="lg:col-span-8">
          {currentResult ? (
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div
                className={`p-6 border-b flex items-center justify-between ${
                  currentResult.passed
                    ? "bg-emerald-500/10 border-emerald-200 dark:border-emerald-900"
                    : "bg-rose-500/10 border-rose-200 dark:border-rose-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  {currentResult.passed ? (
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-8 w-8 text-rose-600" />
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {currentResult.passed ? "Đạt chuẩn định dạng" : "Phát hiện sai lệch định dạng"}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Quy chuẩn: <span className="font-semibold">{currentResult.preset}</span>
                    </p>
                  </div>
                </div>

                <Badge
                  className={`text-sm px-3 py-1 font-bold ${
                    currentResult.passed
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-rose-600 hover:bg-rose-700 text-white"
                  }`}
                >
                  {currentResult.passed ? "PASSED" : "NEEDS REVISION"}
                </Badge>
              </div>

              <CardContent className="pt-6">
                {/* Summary */}
                {currentResult.summary && (
                  <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border text-sm text-slate-700 dark:text-slate-300">
                    <span className="font-bold block mb-1">Tóm tắt kết quả:</span>
                    {currentResult.summary}
                  </div>
                )}

                {/* Detailed Markdown Report */}
                {currentResult.reportMarkdown && (
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
                      Báo cáo chi tiết các thông số đo đạc
                    </h4>
                    <div className="prose prose-slate dark:prose-invert max-w-none text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {currentResult.reportMarkdown}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="h-full min-h-[400px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <FileCheck2 className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Chưa kiểm tra định dạng</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Tải lên file PDF và chọn chuẩn hội nghị (IEEE, Springer,...) để bắt đầu kiểm tra kích thước lề, cỡ chữ và số cột.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
