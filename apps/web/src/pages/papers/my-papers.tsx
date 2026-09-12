import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/services/api-client";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Download,
  Upload,
  AlertCircle,
  ExternalLink,
  Plus,
  Loader2,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatQualityTierName } from "@/utils";

interface MyPaper {
  id: string;
  title: string;
  paperStatus: string;
  dataStatus: string;
  publicationYear: number;
  paperKind?: string;
  externalIds?: { doi?: string };
  qualityScore?: number;
  qualityTier?: number;
  qualityTierName?: string;
  downloadCost?: number | null;
  uploadCreditReward?: number;
  pdfPath?: string;
  createdAt: string;
  rejectionReason?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending Review", color: "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800/50", icon: Clock },
  "not-downloaded": { label: "Approved – Awaiting PDF", color: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800/50", icon: Upload },
  downloaded: { label: "Completed", color: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800/50", icon: CheckCircle },
  rejected: { label: "Rejected", color: "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800/50", icon: XCircle },
  "pending-requester-acceptance": { label: "PDF Awaiting Acceptance", color: "text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/30 dark:border-purple-800/50", icon: AlertCircle },
};

const TIER_COLORS: Record<number, string> = {
  0: "text-slate-500",
  1: "text-blue-500",
  2: "text-green-500",
  3: "text-purple-500",
  4: "text-yellow-500",
};

export function MyPapersPage({ isEmbedded = false }: { isEmbedded?: boolean } = {}) {
  const user = useAuthStore((s) => s.user);

  if (user?.role === "admin") {
    return (
      <main className="container py-8 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-8 max-w-md mx-auto">
          <h2 className="text-xl font-extrabold text-red-700 dark:text-red-400">Access Denied</h2>
          <p className="text-sm text-red-600 dark:text-red-400/80 mt-2">
            Admins do not have a My Papers section.
          </p>
        </div>
      </main>
    );
  }

  const [papers, setPapers] = useState<MyPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const fetchMyPapers = async () => {
    try {
      const res = await api.get("/papers/my-requests");
      setPapers(res.data.data ?? []);
    } catch {
      toast.error("Failed to load your paper submissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyPapers();
  }, []);

  const handleDelete = async (paperId: string) => {
    if (!confirm("Are you sure you want to withdraw this submission?")) return;
    setCancelling(paperId);
    try {
      await api.delete(`/papers/${paperId}`);
      toast.success("Submission withdrawn successfully.");
      setPapers((prev) => prev.filter((p) => p.id !== paperId));
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message ?? "Failed to withdraw submission");
    } finally {
      setCancelling(null);
    }
  };

  const handleDownloadPdf = async (paperId: string) => {
    try {
      const res = await api.get(`/papers/${paperId}/pdf-url`);
      const { downloadUrl, cost } = res.data.data;
      window.open(downloadUrl, "_blank");
      if (cost > 0) toast.info(`${cost} credits deducted for this download.`);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message ?? "Failed to get download URL");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const submitLink = isEmbedded ? "/settings/submit-paper" : "/papers/submit";

  const listContent = (
    <>
      {papers.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">No submissions yet.</p>
          <p className="text-sm text-slate-400 dark:text-zinc-500 mt-1 mb-6">Submit your first research paper to get started.</p>
          <Link to={submitLink}>
            <Button className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white">
              <Plus className="w-4 h-4 mr-2" /> Submit Paper
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {papers.map((paper) => {
            const statusCfg = STATUS_CONFIG[paper.paperStatus] ?? STATUS_CONFIG["pending"]!;
            const StatusIcon = statusCfg.icon;
            const tierColor = TIER_COLORS[paper.qualityTier ?? 0] ?? "text-slate-500";

            return (
              <div
                key={paper.id}
                className="bg-white dark:bg-[#0e0e11] border border-slate-200/80 dark:border-zinc-800/80 rounded-xl shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Link to={`/papers/${paper.id}`} className="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors line-clamp-2">
                      {paper.title}
                    </Link>
                    <p className="text-xs text-slate-500 mt-1">
                      {paper.publicationYear} · {paper.paperKind ?? "article"}
                      {paper.externalIds?.doi && (
                        <span> · <span className="font-mono">{paper.externalIds.doi}</span></span>
                      )}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${statusCfg.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusCfg.label}
                  </span>
                </div>

                {/* Quality info */}
                {paper.qualityScore !== undefined && paper.qualityScore > 0 && (
                  <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-slate-500 dark:text-slate-400">
                    <span>Quality Score: <strong className={tierColor}>{paper.qualityScore}/100</strong></span>
                    {paper.qualityTierName && (
                      <span>Tier: <strong className={tierColor}>{formatQualityTierName(paper.qualityTier, paper.qualityTierName)}</strong></span>
                    )}
                    {paper.downloadCost !== null && paper.downloadCost !== undefined && (
                      <span>Download Cost: <strong>{paper.downloadCost} credits</strong></span>
                    )}
                    {paper.uploadCreditReward !== undefined && paper.uploadCreditReward > 0 && (
                      <span>Upload Reward: <strong className="text-emerald-500">+{paper.uploadCreditReward} credits</strong></span>
                    )}
                  </div>
                )}

                {/* Rejection reason */}
                {paper.paperStatus === "rejected" && paper.rejectionReason && (
                  <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20 text-xs text-red-600 dark:text-red-400">
                    <strong>Rejection reason:</strong> {paper.rejectionReason}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <Link to={`/papers/${paper.id}`}>
                    <Button variant="outline" size="sm" className="text-xs">
                      <ExternalLink className="w-3 h-3 mr-1" /> View Details
                    </Button>
                  </Link>

                  {paper.paperStatus === "rejected" && (
                    <Link to={`/settings/submit-paper?edit=${paper.id}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-900/50"
                      >
                        <Edit className="w-3 h-3 mr-1" /> Edit & Resubmit
                      </Button>
                    </Link>
                  )}

                  {paper.paperStatus === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900/50"
                      disabled={cancelling === paper.id}
                      onClick={() => handleDelete(paper.id)}
                    >
                      {cancelling === paper.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3 mr-1" />}
                      Withdraw
                    </Button>
                  )}

                  {paper.pdfPath && paper.paperStatus === "downloaded" && (
                    <Button
                      size="sm"
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={() => handleDownloadPdf(paper.id)}
                    >
                      <Download className="w-3 h-3 mr-1" /> Download PDF
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  if (isEmbedded) {
    return (
      <div className="space-y-6">
        <div className="mb-6 pb-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              My Submissions
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Track the status of your submitted papers.
            </p>
          </div>
        </div>
        {listContent}
      </div>
    );
  }

  return (
    <main className="container py-8 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">My Submissions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track the status of your submitted papers.
          </p>
        </div>
      </div>
      {listContent}
    </main>
  );
}
