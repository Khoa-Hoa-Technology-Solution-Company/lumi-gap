import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Download, CheckCircle2, Info, Check, Clock, Sparkles, ChevronRight, Loader2, XCircle, Flower, Star, MessageSquare, Trash2, Bookmark as BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, ResponsiveContainer, XAxis, Tooltip, Cell } from "recharts";
import { useReport } from "@/features/reports/hooks/use-reports";
import { useBookmarkStatus, useCreateBookmark, useDeleteBookmark } from "@/features/bookmarks";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import robotImg from "@/assets/robot.png";
import holographicBookImg from "@/assets/holographic_book.png";
import { api } from "@/services/api-client";
import { toast } from "sonner";
import { AiEvaluation } from "@/components/ai-evaluation";
import { useAuthStore } from "@/stores/auth-store";
import { useQueryClient } from "@tanstack/react-query";
import type { PaperRef } from "@trend/shared-types";

const growthData = [
  { year: "2020", volume: 10 },
  { year: "2021", volume: 15 },
  { year: "2022", volume: 30 },
  { year: "2023", volume: 80 },
  { year: "2024", volume: 100 },
];

const CITATION_PATTERN = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

function linkReportCitations(markdown: string, groundingPapers: PaperRef[] = []): string {
  if (groundingPapers.length === 0) return markdown;

  return markdown.replace(CITATION_PATTERN, (match, rawNumbers: string, offset: number, source: string) => {
    // Keep existing markdown links/reference definitions intact, e.g. [1](url).
    const nextChar = source[offset + match.length];
    if (nextChar === "(" || nextChar === ":") return match;

    const linked = rawNumbers
      .split(",")
      .map((raw) => Number(raw.trim()))
      .filter((n) => Number.isInteger(n))
      .map((n) => {
        const paper = groundingPapers[n - 1];
        if (!paper) return `[${n}]`;
        return `[\\[${n}\\]](/papers/${encodeURIComponent(paper.id)} "${citationTitle(n, paper)}")`;
      });

    return linked.length > 0 ? linked.join(", ") : match;
  });
}

function citationTitle(n: number, paper: PaperRef): string {
  const authors = paper.authors?.map((author) => author.displayName).filter(Boolean) ?? [];
  const authorText = authors.length > 0 ? ` - ${authors.slice(0, 3).join(", ")}${authors.length > 3 ? " et al." : ""}` : "";
  return escapeMarkdownTitle(`Citation [${n}] - ${paper.title} (${paper.publicationYear})${authorText}`);
}

function escapeMarkdownTitle(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/[\r\n]+/g, " ");
}

function isGroundingCitationLink(href?: string, title?: string): boolean {
  return Boolean(href?.startsWith("/papers/") && title?.startsWith("Citation ["));
}
const RosePetals = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden print:hidden" aria-hidden="true">
      <style>{`
        @keyframes fall {
          0% { transform: translateY(-10vh) rotate(0deg) rotateX(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(360deg) rotateX(360deg); opacity: 0; }
        }
        .petal {
          position: absolute;
          animation: fall linear infinite;
        }
      `}</style>
      {[...Array(30)].map((_, i) => {
        const left = Math.random() * 100 + 'vw';
        const animationDuration = 6 + Math.random() * 10 + 's';
        const animationDelay = -Math.random() * 15 + 's';
        const width = 12 + Math.random() * 18 + 'px';
        const opacity = 0.5 + Math.random() * 0.5;
        const fill = Math.random() > 0.5 ? 'rgba(236, 72, 153, 0.6)' : 'rgba(244, 114, 182, 0.7)'; 

        return (
          <svg
            key={i}
            className="petal"
            style={{
              left,
              animationDuration,
              animationDelay,
              width,
              opacity,
              fill
            }}
            viewBox="0 0 512 512"
          >
            <path d="M256,0 C350,0 420,100 420,200 C420,350 256,512 256,512 C256,512 92,350 92,200 C92,100 162,0 256,0 Z" />
          </svg>
        );
      })}
    </div>
  );
};

export function ReportViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showRoses, setShowRoses] = useState(true);
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === "admin";
  const { data: report, isLoading, isError } = useReport(id || "");
  const bookmarkStatus = useBookmarkStatus("report", id);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const isBookmarked = bookmarkStatus.data?.bookmarked ?? false;
  const bookmarkBusy = createBookmark.isPending || deleteBookmark.isPending;

  const handleToggleBookmark = () => {
    if (!id) return;

    if (isBookmarked && bookmarkStatus.data?.bookmarkId) {
      deleteBookmark.mutate(
        { id: bookmarkStatus.data.bookmarkId, targetKind: "report", targetId: id },
        {
          onSuccess: () => toast.success("Report removed from bookmarks."),
          onError: (error: any) => {
            toast.error(error?.response?.data?.error?.message || "Failed to remove report bookmark.");
          },
        },
      );
      return;
    }

    createBookmark.mutate(
      { targetKind: "report", targetId: id },
      {
        onSuccess: () => toast.success("Report saved to bookmarks."),
        onError: (error: any) => {
          if (error?.response?.status === 409) {
            toast.info("Report is already in your bookmarks.");
            return;
          }
          toast.error(error?.response?.data?.error?.message || "Failed to save report bookmark.");
        },
      },
    );
  };

  if (isLoading || report?.status === "generating" || report?.status === "queued") {
    return (
      <main className="container py-24 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-6" />
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">AI is generating your report...</h2>
        <p className="text-slate-500 max-w-md mx-auto">
          We are analyzing over 12,000 papers, extracting insights, and writing a comprehensive summary. This usually takes a few seconds.
        </p>
      </main>
    );
  }

  if (report?.status === "failed" || isError) {
    return (
      <main className="container py-24 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <XCircle className="w-12 h-12 text-red-500 mb-6" />
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Report Generation Failed</h2>
        <p className="text-slate-500 max-w-md mx-auto mb-6">
          {report?.errorMessage || "An unexpected error occurred while generating this report."}
        </p>
        <Button onClick={() => navigate("/reports")} variant="outline">
          Back to Reports
        </Button>
      </main>
    );
  }

  const title = report?.topic || report?.query || "AI Analytical Report";
  const markdownWithCitations = report?.markdown
    ? linkReportCitations(report.markdown, report.groundingPapers ?? [])
    : "";

  return (
    <main className="container py-8 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 bg-white dark:bg-[#0f1115] min-h-screen relative overflow-hidden">
      {showRoses && <RosePetals />}
      
      {/* Left side network decoration */}
      <div className="hidden xl:block absolute left-0 top-0 bottom-0 w-[200px] pointer-events-none opacity-50 dark:opacity-20 print:hidden">
        <svg className="absolute w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {/* Vertical data streams */}
          <path d="M 40 50 L 40 2000" fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 6" className="opacity-30" />
          <path d="M 120 150 L 120 2000" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="2 8" className="opacity-20" />
          <path d="M 80 0 L 80 2000" fill="none" stroke="#0ea5e9" strokeWidth="0.5" className="opacity-10" />
          
          {/* Connecting diagonal lines */}
          <path d="M 40 400 L 120 500" fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="2 4" className="opacity-30" />
          <path d="M 120 800 L 40 900" fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="2 4" className="opacity-30" />
          
          {/* Nodes */}
          <circle cx="40" cy="200" r="3" fill="#3b82f6" className="animate-pulse" />
          <circle cx="40" cy="400" r="4" fill="#3b82f6" className="animate-ping" style={{ animationDuration: '3s' }} />
          <circle cx="40" cy="900" r="3" fill="#3b82f6" className="animate-pulse" style={{ animationDelay: '1s' }} />
          
          <circle cx="120" cy="150" r="2" fill="#60a5fa" className="animate-pulse" style={{ animationDelay: '500ms' }} />
          <circle cx="120" cy="500" r="4" fill="#60a5fa" className="animate-ping" style={{ animationDuration: '4s' }} />
          <circle cx="120" cy="800" r="3" fill="#60a5fa" className="animate-pulse" style={{ animationDelay: '1.5s' }} />
        </svg>

        {/* Floating particles */}
        <div className="absolute top-[10%] left-[50%] w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping opacity-60" style={{ animationDuration: '2.5s' }} />
        <div className="absolute top-[30%] left-[20%] w-2 h-2 bg-cyan-400 rounded-full animate-ping opacity-40" style={{ animationDelay: '1s', animationDuration: '3.5s' }} />
        <div className="absolute top-[60%] left-[80%] w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping opacity-50" style={{ animationDelay: '0.5s', animationDuration: '2s' }} />
        <div className="absolute top-[80%] left-[40%] w-2 h-2 bg-cyan-500 rounded-full animate-ping opacity-30" style={{ animationDelay: '2s', animationDuration: '4s' }} />
      </div>

      <div className="flex flex-col lg:flex-row gap-12 relative items-start justify-center print:block print:w-full z-10">
        {/* Center Column (Main Content) */}
        <div className="flex-1 min-w-0 max-w-[800px] print:max-w-none print:w-full">
          {/* Breadcrumb */}
          <div className="flex items-center text-[11px] font-semibold text-slate-500 mb-6 uppercase tracking-wider print:hidden">
            <span onClick={() => navigate("/reports")} className="hover:text-slate-900 cursor-pointer transition-colors">Reports</span>
            <ChevronRight className="w-3 h-3 mx-1" />
            <span className="text-slate-900 dark:text-white">{title}</span>
          </div>

          <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight leading-[1.1] mb-6">
            {title}
          </h1>

          <div className="flex flex-wrap items-center gap-3 mb-8 print:hidden">
            <Button onClick={() => setShowRoses(!showRoses)} variant="outline" className="h-9 px-4 gap-2 text-slate-700 dark:text-slate-300 font-semibold border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50">
              <Flower className="w-4 h-4" /> {showRoses ? "Hide Roses" : "Show Roses"}
            </Button>

            <Button
              onClick={handleToggleBookmark}
              disabled={!id || bookmarkBusy}
              variant={isBookmarked ? "default" : "outline"}
              className={
                isBookmarked
                  ? "h-9 px-4 gap-2 bg-cyan-700 hover:bg-cyan-800 text-white font-semibold rounded-md shadow-sm"
                  : "h-9 px-4 gap-2 text-slate-700 dark:text-slate-300 font-semibold border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50"
              }
            >
              {bookmarkBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BookmarkIcon className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`} />
              )}
              {isBookmarked ? "Saved" : "Save"}
            </Button>
            <Button onClick={() => window.print()} className="h-9 px-4 bg-[#001b69] hover:bg-[#001040] text-white font-semibold gap-2 rounded-md shadow-sm">
              <Download className="w-4 h-4" /> PDF
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500 mb-10 pb-8 border-b border-slate-100 dark:border-slate-800">
            <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> AI-Verified Report
            </span>
            <span className="font-semibold text-slate-400">Generated {report?.completedAt ? new Date(report.completedAt).toLocaleDateString() : 'Recently'}</span>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-blue-600 dark:prose-a:text-blue-400">
            
            {report?.markdown ? (
              <div className="text-slate-600 dark:text-slate-300 text-[15px] leading-[1.7] mb-10 prose-h2:text-[22px] prose-h2:font-semibold prose-h2:text-slate-900 dark:prose-h2:text-white prose-h2:mb-4 prose-h2:mt-8 prose-h3:text-[18px] prose-h3:font-semibold prose-h3:text-slate-900 dark:prose-h3:text-white prose-h3:mt-6 prose-p:mb-4 prose-ul:list-disc prose-ul:pl-6 prose-ol:list-decimal prose-ol:pl-6 prose-li:mb-2 prose-strong:font-bold prose-strong:text-slate-900 dark:prose-strong:text-white">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, title, children, ...props }) => {
                      if (isGroundingCitationLink(href, title)) {
                        return (
                          <Link
                            to={href!}
                            title={title}
                            className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded-md border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-[11px] font-extrabold leading-none text-cyan-700 no-underline shadow-sm transition-colors hover:border-cyan-300 hover:bg-cyan-100 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-300 dark:hover:bg-cyan-900/50"
                          >
                            {children}
                          </Link>
                        );
                      }

                      return (
                        <a href={href} title={title} {...props}>
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {markdownWithCitations}
                </ReactMarkdown>
              </div>
            ) : (
              <>
                <h2 id="executive-summary" className="text-[22px] font-semibold text-slate-900 dark:text-white mb-4 mt-0">Executive Summary</h2>
                <div className="text-slate-600 dark:text-slate-300 text-[15px] leading-[1.7] mb-10 whitespace-pre-wrap">
                  The integration of Large Language Models (LLMs) into educational frameworks has seen an exponential rise between 2020 and 2024. Early adoption focused heavily on automated grading and basic tutoring systems [1]. However, current literature indicates a paradigm shift towards personalized learning pathways and cognitive scaffolding tools.
                </div>
              </>
            )}



            <div className="flex flex-wrap items-center justify-between gap-4 mb-4 mt-12 border-b border-slate-100 dark:border-slate-800/60 pb-3 print:border-none print:pb-0">
              <h2 id="research-gaps" className="text-[22px] font-semibold text-slate-900 dark:text-white m-0 border-none pb-0">Identified Research Gaps</h2>
              <Button onClick={() => navigate(`/research-gaps?source=report&topic=${encodeURIComponent(report?.topic || report?.query || "")}`)} className="h-8 px-4 text-xs font-bold gap-1 print:hidden bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md rounded-full transition-all hover:shadow-lg hover:-translate-y-0.5 border-0">
                View in Research Gaps <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            
            {report?.researchGaps && report.researchGaps.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                {report.researchGaps.map((gap, index) => (
                  <div key={index} className="bg-white dark:bg-[#1c1f26] border-2 border-cyan-200 dark:border-cyan-900/50 rounded-xl p-5 shadow-sm flex flex-col h-full hover:border-cyan-400 dark:hover:border-cyan-700 transition-colors">
                    <h4 className="font-semibold text-slate-900 dark:text-white text-[16px] flex items-start gap-2 m-0 mb-2 leading-tight">
                      <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-400" /> 
                      {gap.title}
                    </h4>
                    <p className="text-[13px] text-slate-600 dark:text-slate-400 m-0 mb-3 leading-relaxed flex-1">
                      {gap.description}
                    </p>
                    {gap.rationale && (
                      <p className="text-[12px] text-slate-500 dark:text-slate-500 m-0 leading-relaxed italic border-t border-slate-100 dark:border-slate-800 pt-3 mt-auto">
                        {gap.rationale}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-6 text-center border border-slate-100 dark:border-slate-800">
                <p className="text-slate-500 text-sm m-0">No research gaps were explicitly identified in this analysis.</p>
              </div>
            )}
          </div>
        </div>


        {/* Right Sidebar */}
        <div className="hidden lg:block w-[320px] shrink-0 sticky top-6 -mt-4 print:hidden">
          {/* Illustration Card */}
          <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-[2rem] p-2 shadow-xl mb-6 flex flex-col relative overflow-hidden group transition-all duration-500 hover:shadow-2xl hover:shadow-cyan-500/10">
            {/* The WOW Illustration Container */}
            <div className="w-full aspect-square relative rounded-[1.75rem] overflow-hidden bg-[#050b14] flex items-center justify-center z-10 border border-slate-800/80 shadow-inner">
              
              {/* Animated subtle grid background */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)] opacity-70" />
              
              {/* Ambient glowing orbs in the background */}
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-cyan-900/40 via-transparent to-blue-900/40 opacity-50" />
              <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-cyan-500/30 rounded-full blur-[40px] animate-pulse" style={{ animationDuration: '4s' }} />
              <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-blue-500/30 rounded-full blur-[40px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />

              {/* The Book Image */}
              <img 
                src={holographicBookImg} 
                alt="AI Analysis Holographic Book" 
                className="w-full h-full object-cover mix-blend-screen animate-[float_5s_ease-in-out_infinite] scale-110 brightness-110 contrast-125 relative z-10" 
                style={{ filter: 'drop-shadow(0 0 15px rgba(6,182,212,0.3))' }}
              />

              {/* Floating interactive particles */}
              <div className="absolute inset-0 pointer-events-none z-20">
                <div className="absolute top-[30%] left-[30%] w-1 h-1 bg-cyan-300 rounded-full shadow-[0_0_8px_2px_rgba(103,232,249,0.8)] animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute top-[45%] right-[25%] w-1.5 h-1.5 bg-blue-300 rounded-full shadow-[0_0_10px_3px_rgba(147,197,253,0.8)] animate-pulse" style={{ animationDuration: '3s' }} />
                <div className="absolute bottom-[40%] left-[40%] w-1 h-1 bg-white rounded-full shadow-[0_0_10px_2px_rgba(255,255,255,0.9)] animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.5s' }} />
              </div>
              
              {/* Bottom gradient overlay to blend with the card below */}
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#050b14] to-transparent pointer-events-none z-30" />
            </div>

            <style>{`
              @keyframes float {
                0% { transform: translateY(0px) scale(1.1); }
                50% { transform: translateY(-8px) scale(1.1); }
                100% { transform: translateY(0px) scale(1.1); }
              }
            `}</style>
            
            <div className="px-5 pb-5 pt-6 text-center flex flex-col items-center">
              <h3 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 mb-3 tracking-tight">AI Analysis Complete</h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                Our AI has synthesized insights from thousands of papers to bring you this comprehensive report.
              </p>
              
              <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-800 to-transparent mb-5" />
              
              <div className="flex flex-col gap-3.5 w-full text-[13px] text-slate-600 dark:text-slate-300 text-left font-medium">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  Facts verified
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  Grounded in literature
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  Data synthesized
                </div>
              </div>
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-[#e0e7ff] to-[#dbeafe] dark:from-[#1e3a8a]/30 dark:to-[#172554]/30 border border-blue-200 dark:border-blue-800/50 rounded-2xl p-6 shadow-sm mb-6">
            <h3 className="text-base font-bold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Explore Further
            </h3>
            <p className="text-sm text-blue-800/80 dark:text-blue-200/80 mb-4 font-medium leading-relaxed">
              Found something interesting? Dive deeper into the research gaps or explore related topics.
            </p>
            <Button onClick={() => navigate(`/research-gaps?source=report&topic=${encodeURIComponent(report?.topic || report?.query || "")}`)} className="w-full bg-[#001b69] hover:bg-[#001040] text-white rounded-xl shadow-sm h-10">
              View Research Gaps
            </Button>
          </div>

          {/* AI quality evaluation — advisory; owner-only on the backend */}
          {!isAdmin && <AiEvaluation targetKind="report" targetId={id || ""} className="mb-6" />}

          {/* Rating Widget */}
          {!isAdmin && <ReportRatingWidget reportId={id || ""} />}
        </div>
      </div>
    </main>
  );
}

function ReportRatingWidget({ reportId }: { reportId: string }) {
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<{ averageRating: number; totalRatings: number }>({ averageRating: 0, totalRatings: 0 });
  const [allRatings, setAllRatings] = useState<any[]>([]);
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const fetchRating = async () => {
    try {
      const res = await api.get(`/quality/report/${reportId}`);
      if (res.data.success && res.data.data) {
        const { ratingSummary, allRatings } = res.data.data;
        if (ratingSummary) {
          setSummary({
            averageRating: ratingSummary.avg,
            totalRatings: ratingSummary.count,
          });
        }
        if (allRatings) {
          setAllRatings(allRatings);
        }
      }
    } catch (err) {
      console.error("Failed to fetch rating:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRating();
  }, [reportId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/quality/rate", {
        targetKind: "report",
        targetId: reportId,
        stars: rating,
        comment: comment.trim() || undefined,
      });
      if (res.data.success) {
        toast.success("Feedback submitted! +5 contribution points earned.");
        setRating(0);
        setComment("");
        
        // Instant points/credits update on UI!
        try {
          const resMe = await api.get("/auth/me");
          if (resMe.data.success) {
            useAuthStore.setState({ user: resMe.data.data.user });
            queryClient.setQueryData(["current-user"], resMe.data.data);
          }
        } catch (e) {
          queryClient.invalidateQueries({ queryKey: ["current-user"] });
        }

        fetchRating();
      }
    } catch (err: any) {
      console.error("Failed to save rating:", err);
      toast.error(err.response?.data?.error?.message || "Failed to submit rating");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReview = async (ratingId: string) => {
    if (!confirm("Are you sure you want to delete your review?")) return;
    try {
      const res = await api.delete(`/quality/rate/${ratingId}`);
      if (res.data.success) {
        toast.success("Review deleted successfully.");
        
        // Instant points/credits update on UI!
        try {
          const resMe = await api.get("/auth/me");
          if (resMe.data.success) {
            useAuthStore.setState({ user: resMe.data.data.user });
            queryClient.setQueryData(["current-user"], resMe.data.data);
          }
        } catch (e) {
          queryClient.invalidateQueries({ queryKey: ["current-user"] });
        }

        fetchRating();
      }
    } catch (err: any) {
      console.error("Failed to delete review:", err);
      toast.error(err.response?.data?.error?.message || "Failed to delete review");
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div>
        <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          Rate this Analytical Report
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Reviewing this report helps refine model synthesis and awards you +5 contribution points.
        </p>
      </div>

      {summary.totalRatings > 0 && (
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-zinc-900/30 p-2 rounded-lg">
          <span className="text-amber-500 flex items-center gap-0.5 font-bold">
            ★ {summary.averageRating.toFixed(1)}
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span>{summary.totalRatings} user {summary.totalRatings === 1 ? "rating" : "ratings"}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="flex items-center gap-1.5 py-1">
          {[1, 2, 3, 4, 5].map((star) => {
            const active = hoverRating ? star <= hoverRating : star <= rating;
            return (
              <button
                key={star}
                type="button"
                className="transition-transform active:scale-90"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                aria-pressed={star <= rating}
              >
                <Star
                  className={`w-7 h-7 cursor-pointer transition-colors ${
                    active 
                      ? "text-amber-400 fill-amber-400 filter drop-shadow-[0_0_2px_rgba(250,204,21,0.4)]" 
                      : "text-slate-300 dark:text-slate-700"
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="space-y-1">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add comments or notes about accuracy, completeness... (Optional)"
            className="w-full text-xs bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 h-20 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none dark:text-white"
            maxLength={1000}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm h-10 font-bold text-xs gap-1.5"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Submit Feedback (+5 pts)
          </Button>
        </div>
      </form>

      {allRatings.length > 0 && (
        <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 mt-4 space-y-3 animate-fadeIn">
          <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            All Reviews
          </h4>
          <div className="divide-y divide-slate-100 dark:divide-zinc-800 max-h-[220px] overflow-y-auto pr-1 space-y-2.5">
            {allRatings.map((rating: any, index: number) => {
              const userInit = rating.user?.fullName?.charAt(0) || "?";
              const userName = rating.user?.fullName || "Anonymous";
              const isMyReview = rating.user?.id === currentUser?.id;
              return (
                <div key={rating.id || index} className="pt-2.5 first:pt-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5.5 h-5.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/40 flex items-center justify-center text-[9px] font-bold text-blue-700 dark:text-blue-400">
                        {userInit}
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[100px]" title={userName}>
                        {userName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-2.5 h-2.5 ${
                              star <= rating.stars ? "text-amber-400 fill-amber-400" : "text-slate-200 dark:text-slate-800"
                            }`}
                          />
                        ))}
                      </div>
                      {isMyReview && (
                        <button
                          type="button"
                          onClick={() => handleDeleteReview(rating.id)}
                          className="text-red-500 hover:text-red-700 transition-colors p-0.5"
                          title="Delete review"
                          aria-label="Delete review"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {rating.comment && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 italic bg-slate-50/50 dark:bg-zinc-950/20 p-2 rounded border border-slate-100 dark:border-zinc-800/50 break-words leading-relaxed">
                      "{rating.comment}"
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
