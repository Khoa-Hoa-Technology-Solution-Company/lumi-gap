import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  BookOpen,
  FileText,
  Lightbulb,
  Users,
  Compass,
  ArrowRight,
  TrendingUp,
  Cpu,
  Activity,
  AlertTriangle,
  Bookmark,
  Sparkles,
  History,
  FolderKanban,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/features/auth";
import { useHomeOverview } from "@/features/home/hooks/use-home-overview";
import { PaperCard } from "@/components/paper-card";
import { Bar, BarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { HomeOverview } from "@trend/shared-types";
import { formatNumber } from "@/utils";

export function HomePage() {
  const { data: me } = useCurrentUser();
  const { data, isLoading, isError } = useHomeOverview();

  if (isLoading) {
    return <HomeSkeleton />;
  }

  if (isError || !data) {
    return <HomeErrorFallback />;
  }

  return (
    <div className="w-full space-y-6 select-none pb-12">
      {/* 1. Header / Hero Section based on Mode */}
      {data.mode === "guest" ? (
        <GuestHero />
      ) : (
        <UserHero name={me?.user?.fullName || me?.user?.email || "Researcher"} />
      )}

      {/* 2. Admin Health summary (If Admin Mode) */}
      {data.mode === "admin" && data.admin && <AdminHealthSummary admin={data.admin} />}

      {/* 3. System Snapshot Cards */}
      {data.mode === "guest" && data.summary ? (
        <GuestSystemSnapshot
          summary={data.summary}
          topTrend={data.trends?.topics?.[0]?.topic}
        />
      ) : (
        data.workspace && <WorkspaceSnapshot workspace={data.workspace} />
      )}

      {/* 4. Guest explanation Pipeline under Hero */}
      {data.mode === "guest" && <PipelineSection />}

      {/* 5. Capability cards for Guest */}
      {data.mode === "guest" && <CapabilityCards />}

      {/* 6. Main Cockpit Layout (Asymmetric 2-Column Grid) for Logged-in Users */}
      {data.mode !== "guest" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Column (Left - 8/12) */}
          <div className="lg:col-span-8 space-y-6">
            <LiveVelocityChart trends={data.trends} />
            {data.workspace && <WorkspaceActivityTabs workspace={data.workspace} />}
            <RecentIndexedPapers recentPapers={data.recentPapers} />
          </div>

          {/* Sidebar Column (Right - 4/12) */}
          <div className="lg:col-span-4 space-y-6">
            <AIQuickGenerator />
            <TrendingTopicsWidget trends={data.trends} />
            <RisingKeywordsWidget trends={data.trends} />
            {data.workspace && <RecentSearchesWidget workspace={data.workspace} />}
          </div>
        </div>
      ) : (
        /* Guest Layout falls back to static layout */
        <LiveSignalsSection trends={data.trends} recentPapers={data.recentPapers} />
      )}
    </div>
  );
}

// ==================== SUBCOMPONENTS ====================

// 1. Guest Hero Section
function GuestHero() {
  return (
    <div className="relative text-center py-16 md:py-24 space-y-8 max-w-4xl mx-auto overflow-hidden rounded-3xl bg-gradient-to-b from-blue-50/40 via-indigo-50/10 to-transparent dark:from-blue-950/10 dark:via-indigo-950/5 dark:to-transparent border border-slate-200/50 dark:border-slate-800/40 p-6 md:p-10 shadow-sm">
      <div className="absolute -top-12 -left-12 w-48 h-48 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50/80 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs font-bold text-blue-700 dark:text-blue-400 select-none">
        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
        <span>Next-Gen Analytics Engine</span>
      </div>

      <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white leading-tight max-w-3xl mx-auto">
        AI-assisted publication <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">trend analysis</span>
      </h1>
      <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
        Unlock deep scientific insights. Norm and embed literature corpora with hybrid AI search,
        automatic trend intelligence, qualitative research gap detection, and evidence-backed RAG reports.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 pt-2 w-full">
        <Button size="default" className="w-full sm:w-auto rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold h-11 px-6 shadow-md transition-all gap-2" asChild>
          <Link to="/search">
            <Search className="w-4 h-4" />
            Search Papers
          </Link>
        </Button>
        <Button variant="outline" size="default" className="w-full sm:w-auto rounded-xl border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 hover:bg-slate-50 dark:hover:bg-slate-950 active:scale-[0.98] font-bold h-11 px-6 shadow-sm transition-all" asChild>
          <Link to="/trends">Explore Trends</Link>
        </Button>
        <Button size="default" className="w-full sm:w-auto rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold h-11 px-6 shadow-md transition-all dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-[0.98]" asChild>
          <Link to="/reports?create=true">Generate Report</Link>
        </Button>
        <Button variant="ghost" size="default" className="w-full sm:w-auto rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white font-bold h-11 px-4" asChild>
          <Link to="/login" className="flex items-center justify-center gap-1">
            Sign in <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// 2. Logged-in User Hero Section (Vuexy Clean Greeting Cockpit)
function UserHero({ name }: { name: string }) {
  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return (
    <div className="relative overflow-hidden bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 dark:from-blue-500/10 dark:to-indigo-500/10 rounded-bl-full pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
              Welcome back,
            </span>
            <span className="text-xl md:text-2xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">
              {name}
            </span>
          </div>
          <p className="text-xs md:text-sm font-semibold text-slate-500 dark:text-slate-400">
            Overview of your research cockpit and systems.
          </p>
        </div>

        <div className="text-left sm:text-right shrink-0">
          <span className="text-xs font-bold text-slate-450 dark:text-slate-550 block">TODAY</span>
          <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 block mt-0.5">{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}

// 3. Guest System Snapshot Card Component
function GuestSystemSnapshot({
  summary,
  topTrend
}: {
  summary: HomeOverview["summary"];
  topTrend: string | undefined;
}) {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <KPICard
        title="Papers Indexed"
        value={summary.totalPapers}
        icon={<BookOpen className="w-5 h-5 text-blue-600" />}
        onClick={() => navigate("/search")}
      />
      <KPICard
        title="Searches Served"
        value={summary.totalSearches}
        icon={<Search className="w-5 h-5 text-indigo-600" />}
        isNeutral
      />
      <KPICard
        title="Active Users"
        value={summary.uniqueUsers}
        icon={<Users className="w-5 h-5 text-purple-600" />}
        isNeutral
      />
      <KPICard
        title="Emerging Trend"
        value={topTrend || "N/A"}
        icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
        onClick={() => topTrend ? navigate(`/trends/${encodeURIComponent(topTrend)}`) : navigate("/trends")}
      />
    </div>
  );
}

// 4. Workspace Snapshot Cards
function WorkspaceSnapshot({ workspace }: { workspace: NonNullable<HomeOverview["workspace"]> }) {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <KPICard
        title="Saved Papers"
        value={workspace.bookmarkCount}
        icon={<Bookmark className="w-5 h-5 text-blue-600" />}
        onClick={() => navigate("/bookmarks")}
      />
      <KPICard
        title="AI Reports"
        value={workspace.reportCount}
        icon={<FileText className="w-5 h-5 text-indigo-600" />}
        onClick={() => navigate("/reports")}
      />
      <KPICard
        title="Projects Tracked"
        value={workspace.projectCount}
        icon={<FolderKanban className="w-5 h-5 text-purple-600" />}
        onClick={() => navigate("/projects")}
      />
      <KPICard
        title="Recent Queries"
        value={workspace.recentSearches.length}
        icon={<History className="w-5 h-5 text-amber-600" />}
        isNeutral
      />
    </div>
  );
}

// 5. Admin Mini Health Card
function AdminHealthSummary({ admin }: { admin: NonNullable<HomeOverview["admin"]> }) {
  const reportsCount = (admin.reports?.queued || 0) + (admin.reports?.generating || 0);
  return (
    <div className="rounded-2xl border border-dashed border-red-500/20 bg-red-50/30 dark:bg-red-950/5 p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-red-500/10 pb-3">
        <h3 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-4 h-4 animate-pulse" />
          System Health indicators
        </h3>
        <Link to="/admin" className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
          Admin Dashboard ➔
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs select-none">
        <div>
          <span className="text-slate-400 font-semibold block">Pending Requests:</span>
          <Link to="/admin/papers" className="text-sm font-bold text-slate-800 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 mt-1 block">
            {formatNumber(admin.pendingPaperRequests)} papers
          </Link>
        </div>

        <div>
          <span className="text-slate-400 font-semibold block">Embedding Queue:</span>
          <Link to="/admin/sync" className="text-sm font-bold text-slate-800 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 mt-1 block">
            {formatNumber(admin.embedding.pending)} pending
          </Link>
        </div>

        <div>
          <span className="text-slate-400 font-semibold block">Sync Pipeline:</span>
          <Link to="/admin/sync" className="text-sm font-bold mt-1 block">
            {admin.sync.running ? (
              <span className="text-amber-500 font-bold animate-pulse">Running</span>
            ) : admin.sync.latest?.status === "failed" ? (
              <span className="text-red-500 font-bold">Latest Failed</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Idle</span>
            )}
          </Link>
        </div>

        <div>
          <span className="text-slate-400 font-semibold block">Active AI Jobs:</span>
          <Link to="/reports" className="text-sm font-bold text-slate-800 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 mt-1 block">
            {formatNumber(reportsCount)} reports
          </Link>
        </div>
      </div>
    </div>
  );
}

// 6. Pipeline explanation Section
function PipelineSection() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 p-6 md:p-8 space-y-6">
      <div className="text-center space-y-1.5 max-w-xl mx-auto">
        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Academic Intel Pipeline
        </h3>
        <p className="text-sm font-bold text-slate-850 dark:text-slate-200">
          How raw academic metadata is transformed into actionable research insights
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch text-xs">
        {/* Step 1 */}
        <div className="relative overflow-hidden bg-white dark:bg-[#121212] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
          <div className="space-y-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-extrabold flex items-center justify-center shadow-sm">1</div>
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">Corpus Sourcing</h4>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              OpenAlex Live Index combined with manual PDF upload and custom team internal directories.
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="relative overflow-hidden bg-white dark:bg-[#121212] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
          <div className="space-y-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-extrabold flex items-center justify-center shadow-sm">2</div>
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">Vector Norm</h4>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              Metadata normalization, content-structure quality gate filtering, and 768-D dense vector embedding.
            </p>
          </div>
        </div>

        {/* Step 3 */}
        <div className="relative overflow-hidden bg-white dark:bg-[#121212] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
          <div className="space-y-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-extrabold flex items-center justify-center shadow-sm">3</div>
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">AI Analysis</h4>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              Vector retrieval semantic search, multi-axis trend charting, and algorithmic gap discovery.
            </p>
          </div>
        </div>

        {/* Step 4 */}
        <div className="relative overflow-hidden bg-blue-50/30 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-500/5 to-transparent rounded-bl-full pointer-events-none" />
          <div className="space-y-3 relative z-10">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 text-white font-extrabold flex items-center justify-center shadow-sm">4</div>
            <h4 className="font-extrabold text-blue-700 dark:text-blue-400 text-sm">Evidence Direction</h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
              RAG synthesized reports, structured citation matrix, and conversational research project cockpit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// 7. Capability Cards (6 blocks)
function CapabilityCards() {
  const capabilities = [
    {
      title: "Semantic Search",
      desc: "Go beyond keywords. Find papers via vector-dense embeddings mapped by neural understanding.",
      icon: Compass,
      color: "text-blue-600"
    },
    {
      title: "Trend Intelligence",
      desc: "Visualize multi-year publication volumes, citation spikes, and topic comparison charts.",
      icon: TrendingUp,
      color: "text-emerald-600"
    },
    {
      title: "Research Gaps",
      desc: "Systematic algorithmic detection of underserved areas, discrepancies, and new research directions.",
      icon: Lightbulb,
      color: "text-amber-600"
    },
    {
      title: "RAG Reports",
      desc: "Structured evidence-backed analytical documents generated directly on top of filtered corpora.",
      icon: FileText,
      color: "text-indigo-600"
    },
    {
      title: "Project Chat",
      desc: "Collaborate and query files in real-time inside structured workspaces with persistent memory.",
      icon: Users,
      color: "text-purple-600"
    },
    {
      title: "Local AI via Ollama",
      desc: "Optional local model provider for project chat / lightweight local AI tasks when configured.",
      icon: Cpu,
      color: "text-pink-600",
      isDisclaimer: true
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1.5">
        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Platform Core Capabilities
        </h3>
        <p className="text-sm font-bold text-slate-800 dark:text-white">
          Powerful tools designed to transform search and literature indexing
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {capabilities.map((c) => (
          <div key={c.title} className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#121212] p-6 shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 flex flex-col justify-between gap-4 group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-slate-500/5 to-transparent rounded-bl-full pointer-events-none" />

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 shrink-0 group-hover:scale-110 transition-transform`}>
                  <c.icon className={`w-5 h-5 ${c.color}`} />
                </div>
                <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">{c.title}</h4>
              </div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                {c.desc}
              </p>
            </div>
            {c.isDisclaimer && (
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 block border-t border-slate-100 dark:border-slate-800/60 pt-3">
                * Note: Gemini remains standard for heavy RAG report synthesis.
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 8. AI Quick Generator Widget (Vuexy-style Sidebar Item)
function AIQuickGenerator() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/reports?create=true&topic=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-blue-500/5 via-indigo-500/5 to-transparent dark:from-blue-950/10 dark:via-indigo-950/5 p-5 shadow-sm">
      <div className="space-y-3 relative z-10">
        <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800/60">
          <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-sm">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <h3 className="text-sm font-bold text-slate-850 dark:text-slate-200">
            AI Quick Generator
          </h3>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
          Launch a comprehensive evidence-backed RAG report instantly on any research concept.
        </p>

        <form onSubmit={handleGenerate} className="space-y-2 pt-1">
          <input
            type="text"
            placeholder="Enter research topic..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
          />
          <Button
            type="submit"
            className="w-full h-9 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs shadow-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
            disabled={!query.trim()}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate AI Report
          </Button>
        </form>
      </div>
    </div>
  );
}

// 9. Workspace Activity Tabs (Reports & Projects Tabs)
function WorkspaceActivityTabs({ workspace }: { workspace: NonNullable<HomeOverview["workspace"]> }) {
  const [activeTab, setActiveTab] = useState<"reports" | "projects">("reports");
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] p-5 shadow-sm space-y-4">
      {/* Header & Switchers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600">
            <FolderKanban className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-850 dark:text-slate-250">
            Workspace Activity
          </h3>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "reports"
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/50 dark:border-slate-700/60"
                : "text-slate-450 dark:text-slate-500 hover:text-slate-700"
            }`}
          >
            AI Reports ({formatNumber(workspace.reportCount)})
          </button>
          <button
            onClick={() => setActiveTab("projects")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "projects"
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/50 dark:border-slate-700/60"
                : "text-slate-450 dark:text-slate-500 hover:text-slate-700"
            }`}
          >
            Projects ({formatNumber(workspace.projectCount)})
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="min-h-[160px] pt-1">
        {activeTab === "reports" ? (
          workspace.latestReports.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-xs text-slate-400 space-y-3 select-none">
              <FileText className="w-8 h-8 text-slate-300 dark:text-slate-700 stroke-[1.5]" />
              <p className="font-semibold text-slate-450">No reports generated yet.</p>
              <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-bold shadow-sm" asChild>
                <Link to="/reports?create=true">Generate First Report</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {workspace.latestReports.slice(0, 4).map((r) => (
                <div
                  key={r.id}
                  onClick={() => navigate(`/reports/${r.id}`)}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/65 hover:border-blue-250 dark:hover:border-blue-900/40 hover:bg-blue-50/20 dark:hover:bg-blue-950/10 cursor-pointer transition-all duration-200 group"
                >
                  <div className="truncate pr-2 space-y-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-350 truncate block group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" title={r.topic || r.query}>
                      {r.topic || r.query}
                    </span>
                    <span className="text-[10px] text-slate-400 block font-semibold">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border shrink-0 ${
                    r.status === "ready" ? "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40" :
                    r.status === "failed" ? "bg-red-50 text-red-600 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/40" :
                    "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/40 animate-pulse"
                  }`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : (
          workspace.latestProjects.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-xs text-slate-400 space-y-3 select-none">
              <FolderKanban className="w-8 h-8 text-slate-300 dark:text-slate-700 stroke-[1.5]" />
              <p className="font-semibold text-slate-450">No projects created yet.</p>
              <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-bold shadow-sm" asChild>
                <Link to="/projects">Create Project</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {workspace.latestProjects.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/65 hover:border-blue-250 dark:hover:border-blue-900/40 hover:bg-blue-50/20 dark:hover:bg-blue-950/10 cursor-pointer transition-all duration-200 group"
                >
                  <div className="truncate pr-2 space-y-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-350 truncate block group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" title={p.title}>
                      {p.title}
                    </span>
                    <span className="text-[10px] text-slate-400 block font-semibold">
                      Updated: {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded shrink-0">
                    {formatNumber(p.paperCount)} papers
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// 10. Live Velocity Chart
function LiveVelocityChart({ trends }: { trends: HomeOverview["trends"] }) {
  const velocityData = (trends.yearlyTotalPapers || []).map((p: any) => ({
    name: p.year > trends.lastCompleteYear ? `${p.year} (YTD)` : p.year.toString(),
    value: p.count
  }));

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          Publication Velocity
        </h3>
        <p className="text-[10px] text-slate-450 mt-0.5 font-semibold">
          Annual volume of academic papers indexed within the current corpus scope.
        </p>
      </div>

      <div className="h-52 w-full text-xs pt-2 select-none">
        {velocityData.length === 0 ? (
          <div className="h-full flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 text-xs">
            No yearly trend data yet. Sync more papers to populate this chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={velocityData} barSize={28}>
              <Tooltip
                cursor={{ fill: "transparent" }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  backgroundColor: "rgba(255, 255, 255, 0.95)"
                }}
              />
              <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// 11. Recent Indexed Papers
function RecentIndexedPapers({ recentPapers }: { recentPapers: HomeOverview["recentPapers"] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-850 dark:text-white uppercase tracking-widest">
          Recent Indexed Papers
        </h3>
        <Button variant="link" size="sm" className="text-xs font-bold p-0 h-auto" asChild>
          <Link to="/search">Explore Library</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {recentPapers.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl select-none">
            No recent papers found. Click "Explore Library" to run search.
          </div>
        ) : (
          recentPapers.map((paper) => (
            <PaperCard
              key={paper.id}
              id={paper.id}
              journal={paper.journalName || "Unknown Journal"}
              date={paper.publicationDate ? new Date(paper.publicationDate).toLocaleDateString() : paper.publicationYear.toString()}
              title={paper.title}
              abstract={paper.abstractText || "No abstract available"}
              authors={paper.authors?.map((a: any) => a.displayName).join(", ") || "Unknown Author"}
              score={paper.dataQualityScore?.toFixed(2) || "N/A"}
            />
          ))
        )}
      </div>
    </div>
  );
}

// 12. Trending Topics Sidebar Widget
function TrendingTopicsWidget({ trends }: { trends: HomeOverview["trends"] }) {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] p-5 shadow-sm space-y-4">
      <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-slate-400" />
        Trending Topics
      </h3>
      <div className="flex flex-wrap gap-2 pt-1 select-none">
        {trends.topics.length === 0 ? (
          <span className="text-xs text-slate-400">No trending topics.</span>
        ) : (
          trends.topics.slice(0, 6).map((topic, idx) => {
            const colors = [
              "bg-blue-50/80 text-blue-750 border-blue-200/50 hover:bg-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/40",
              "bg-emerald-50/80 text-emerald-700 border-emerald-200/50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40",
              "bg-purple-50/80 text-purple-700 border-purple-200/50 hover:bg-purple-100 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/40",
              "bg-slate-50/80 text-slate-700 border-slate-200/50 hover:bg-slate-100 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700/60"
            ];
            const colorClass = colors[idx % colors.length];
            return (
              <button
                key={topic.topic}
                onClick={() => navigate(`/trends/${encodeURIComponent(topic.topic)}`)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border hover:scale-[1.02] transition-all text-left shadow-sm active:scale-95 duration-200 ${colorClass}`}
              >
                {topic.topic}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// 13. Rising Keywords Sidebar Widget
function RisingKeywordsWidget({ trends }: { trends: HomeOverview["trends"] }) {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] p-5 shadow-sm space-y-4">
      <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-slate-400" />
        Rising Keywords
      </h3>
      <ul className="space-y-2.5 text-xs">
        {trends.risingKeywords.length === 0 ? (
          <li className="text-slate-400">No rising keywords.</li>
        ) : (
          trends.risingKeywords.slice(0, 8).map((k, idx) => (
            <li
              key={`k-${idx}`}
              onClick={() => navigate(`/search?q=${encodeURIComponent(k.keyword)}`)}
              className="p-3 border border-slate-100 dark:border-slate-800/60 rounded-xl hover:bg-blue-50/30 dark:hover:bg-blue-950/10 cursor-pointer transition-all duration-300 space-y-1.5 hover:border-blue-300 hover:translate-x-0.5 hover:shadow-sm"
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-850 dark:text-slate-200">{k.keyword}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full">
                  +{Math.round(k.growthRatePct)}%
                </span>
              </div>
              {(k as any).warning && (
                <div className="flex items-center gap-1 text-[9.5px] text-amber-600 font-mono">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{(k as any).warning}</span>
                </div>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// 14. Recent Searches Sidebar Widget (Moved to Sidebar Column)
function RecentSearchesWidget({ workspace }: { workspace: NonNullable<HomeOverview["workspace"]> }) {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800/60">
        <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-600">
          <History className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          Recent Searches
        </h3>
      </div>

      {workspace.recentSearches.length === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center text-center text-xs text-slate-400 space-y-2 select-none">
          <Search className="w-8 h-8 text-slate-350 dark:text-slate-700 stroke-[1.5]" />
          <p className="font-bold text-slate-400 mt-1">No recent searches yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workspace.recentSearches.slice(0, 5).map((s, idx) => (
            <div
              key={`s-${idx}`}
              onClick={() => navigate(`/search?q=${encodeURIComponent(s.query)}`)}
              className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800/60 hover:border-blue-200 dark:hover:border-blue-900/40 hover:bg-blue-50/20 dark:hover:bg-blue-950/10 cursor-pointer transition-all duration-200 group"
            >
              <div className="flex items-center gap-2.5 truncate pr-2">
                <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400" title={s.query}>
                  {s.query}
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded">
                {formatNumber(s.resultCount)} res
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 15. Standard KPI Card Sub-component
function KPICard({
  title,
  value,
  icon,
  isNeutral = false,
  onClick
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  isNeutral?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#121212] p-5 shadow-sm transition-all duration-350 select-none focus:outline-none focus:ring-1 focus:ring-ring ${
        onClick
          ? "cursor-pointer hover:bg-blue-50/10 dark:hover:bg-blue-950/10 hover:shadow-md hover:-translate-y-0.5 hover:border-blue-300/60 dark:hover:border-blue-800"
          : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">
            {title}
          </span>
          <span className="text-3xl font-bold text-slate-900 dark:text-white block font-sans leading-none">
            {typeof value === "number" ? formatNumber(value) : value}
          </span>
        </div>
        <div className={`p-3 rounded-xl transition-all duration-350 ${
          isNeutral
            ? "bg-slate-55 dark:bg-slate-800/80 text-slate-450 dark:text-slate-400"
            : "bg-blue-50/80 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
        }`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// 16. Live Signals Section (Static fallback/Guest mode)
function LiveSignalsSection({
  trends,
  recentPapers
}: {
  trends: HomeOverview["trends"];
  recentPapers: HomeOverview["recentPapers"];
}) {
  const navigate = useNavigate();
  const velocityData = (trends.yearlyTotalPapers || []).map((p: any) => ({
    name: p.year > trends.lastCompleteYear ? `${p.year} (YTD)` : p.year.toString(),
    value: p.count
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-t border-slate-200 dark:border-slate-800 pt-8">
      <div className="lg:col-span-8 space-y-8">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Publication Velocity
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">
              Annual volume of academic papers indexed within the current corpus scope.
            </p>
          </div>
          <div className="h-52 w-full text-xs pt-2 select-none">
            {velocityData.length === 0 ? (
              <div className="h-full flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 text-xs">
                No yearly trend data yet. Sync more papers to populate this chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={velocityData} barSize={28}>
                  <Tooltip
                    cursor={{ fill: "transparent" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                      backgroundColor: "rgba(255, 255, 255, 0.95)"
                    }}
                  />
                  <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-850 dark:text-white uppercase tracking-widest">
              Recent Indexed Papers
            </h3>
            <Button variant="link" size="sm" className="text-xs font-bold p-0 h-auto" asChild>
              <Link to="/search">Explore Library</Link>
            </Button>
          </div>
          <div className="flex flex-col gap-4">
            {recentPapers.map((paper) => (
              <PaperCard
                key={paper.id}
                id={paper.id}
                journal={paper.journalName || "Unknown Journal"}
                date={paper.publicationDate ? new Date(paper.publicationDate).toLocaleDateString() : paper.publicationYear.toString()}
                title={paper.title}
                abstract={paper.abstractText || "No abstract available"}
                authors={paper.authors?.map((a: any) => a.displayName).join(", ") || "Unknown Author"}
                score={paper.dataQualityScore?.toFixed(2) || "N/A"}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-4 space-y-6">
        <TrendingTopicsWidget trends={trends} />
        <RisingKeywordsWidget trends={trends} />
      </div>
    </div>
  );
}

// 17. Home Skeletons (Loading state)
function HomeSkeleton() {
  return (
    <div className="w-full space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-4 w-96 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={`ske-k-${idx}`} className="h-20 w-full rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton key={`ske-col-${idx}`} className="h-52 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// 18. Home Error Fallback View
function HomeErrorFallback() {
  return (
    <div className="w-full max-w-md mx-auto py-20 text-center space-y-5">
      <AlertTriangle className="mx-auto h-14 w-14 text-red-500/80 animate-bounce" />
      <div className="space-y-1.5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Failed to load overview</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[36ch] mx-auto leading-relaxed">
          Home overview failed to load. You can still search papers or explore trends.
        </p>
      </div>
      <div className="flex items-center justify-center gap-3 pt-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/search">Search Papers</Link>
        </Button>
        <Button size="sm" asChild>
          <Link to="/trends">Explore Trends</Link>
        </Button>
      </div>
    </div>
  );
}
