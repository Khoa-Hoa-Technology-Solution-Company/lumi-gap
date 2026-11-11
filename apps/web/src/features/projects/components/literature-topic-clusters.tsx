import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Compass,
  Database,
  FileCode2,
  FileText,
  Filter,
  FolderKanban,
  GitCompare,
  HelpCircle,
  Layers,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand, useResearchResource } from "../hooks/use-project-research";
import { WorkspaceError, WorkspaceLoading } from "./workspace-common";

type GroupByMode = "topic" | "methodology" | "question" | "tag";

interface EnrichedPaperItem {
  paperId: string;
  title: string;
  doi: string | null;
  publicationYear: number | null;
  journalName: string | null;
  authors: string[];
  abstractText: string | null;
  screeningStatus: string;
  tags: string[];
  collectionName: string | null;
  themes: string[];
  methodologies: string[];
  populations: string[];
  claims: string[];
  results: string[];
  limitations: string[];
  questions: Array<{ id: string; text: string }>;
  verifiedCount: number;
  extractionCount: number;
  hasFullTextEvidence: boolean;
}

function buildCitationKey(title: string, authors?: string[], year?: number | null): string {
  const firstAuthor = authors?.[0]
    ? authors[0]
        .trim()
        .split(/\s+/)
        .slice(-1)[0]
        ?.replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase() || "author"
    : "paper";
  const y = year ? String(year) : "nd";
  const firstWord =
    title
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase() || "work";
  return `${firstAuthor}${y}${firstWord}`;
}

export function LiteratureTopicClustersView({
  projectId,
  readOnly,
  onOpenPaper,
}: {
  projectId: string;
  readOnly: boolean;
  onOpenPaper?: (paperId: string) => void;
}) {
  const [searchParams] = useSearchParams();
  const initialCompareId = searchParams.get("compare");

  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupByMode>("topic");
  const [selectedTopic, setSelectedTopic] = useState<string>("ALL");
  const [selectedMethod, setSelectedMethod] = useState<string>("ALL");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("ALL");
  const [selectedTag, setSelectedTag] = useState<string>("ALL");
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>(
    initialCompareId ? [initialCompareId] : []
  );
  const [copiedCiteId, setCopiedCiteId] = useState<string | null>(null);
  const [editingTagsPaperId, setEditingTagsPaperId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [collectionDraft, setCollectionDraft] = useState("");

  const workspaceQuery = useResearchResource(
    projectId,
    ["evidence-workspace-clusters"],
    () => researchApi.evidenceWorkspace(projectId, { page: 1, pageSize: 100 })
  );
  const libraryQuery = useResearchResource(
    projectId,
    ["library-clusters"],
    () => researchApi.library(projectId, { page: 1, pageSize: 100 })
  );
  const evidenceQuery = useResearchResource(
    projectId,
    ["evidence-clusters"],
    () => researchApi.evidence(projectId, { page: 1, pageSize: 100 })
  );
  const questionsQuery = useResearchResource(
    projectId,
    ["questions"],
    () => researchApi.questions(projectId)
  );
  const command = useResearchCommand(projectId);

  const isLoading =
    workspaceQuery.isLoading && libraryQuery.isLoading && evidenceQuery.isLoading;

  const papers: EnrichedPaperItem[] = useMemo(() => {
    const libItems = libraryQuery.data?.items ?? [];
    const wsItems = workspaceQuery.data?.items ?? [];
    const evItems = evidenceQuery.data?.items ?? [];

    const map = new Map<string, EnrichedPaperItem>();

    for (const lib of libItems) {
      map.set(lib.paperId, {
        paperId: lib.paperId,
        title: lib.title,
        doi: lib.doi,
        publicationYear: lib.publicationYear,
        journalName: lib.journalName,
        authors: lib.authors ?? [],
        abstractText: lib.abstractText,
        screeningStatus: lib.screeningStatus,
        tags: lib.tags ?? [],
        collectionName: lib.collectionName,
        themes: lib.collectionName ? [lib.collectionName] : [],
        methodologies: [],
        populations: [],
        claims: [],
        results: [],
        limitations: [],
        questions: [],
        verifiedCount: 0,
        extractionCount: 0,
        hasFullTextEvidence: (lib.files?.length ?? 0) > 0,
      });
    }

    for (const ws of wsItems) {
      const existing = map.get(ws.paperId) ?? {
        paperId: ws.paperId,
        title: ws.title,
        doi: ws.doi,
        publicationYear: ws.publicationYear,
        journalName: null,
        authors: [],
        abstractText: null,
        screeningStatus: ws.screeningStatus,
        tags: [],
        collectionName: null,
        themes: [],
        methodologies: [],
        populations: [],
        claims: [],
        results: [],
        limitations: [],
        questions: [],
        verifiedCount: 0,
        extractionCount: 0,
        hasFullTextEvidence: false,
      };
      const mergedThemes = Array.from(new Set([...existing.themes, ...(ws.themes ?? [])]));
      const mergedQuestions = [...existing.questions];
      for (const q of ws.questions ?? []) {
        if (!mergedQuestions.some((mq) => mq.id === q.id)) mergedQuestions.push(q);
      }
      map.set(ws.paperId, {
        ...existing,
        themes: mergedThemes,
        questions: mergedQuestions,
        verifiedCount: Math.max(existing.verifiedCount, ws.verifiedCount ?? 0),
        extractionCount: Math.max(existing.extractionCount, ws.extractionCount ?? 0),
      });
    }

    for (const ev of evItems) {
      const target = map.get(ev.paperId);
      if (!target) continue;
      if (ev.methodology && !target.methodologies.includes(ev.methodology)) {
        target.methodologies.push(ev.methodology);
      }
      if (ev.population && !target.populations.includes(ev.population)) {
        target.populations.push(ev.population);
      }
      if (ev.claim && !target.claims.includes(ev.claim)) {
        target.claims.push(ev.claim);
      }
      if (ev.results && !target.results.includes(ev.results)) {
        target.results.push(ev.results);
      }
      if (ev.limitations && !target.limitations.includes(ev.limitations)) {
        target.limitations.push(ev.limitations);
      }
      for (const th of ev.themes ?? []) {
        if (th && !target.themes.includes(th)) target.themes.push(th);
      }
      for (const rq of ev.relatedQuestions ?? []) {
        if (!target.questions.some((q) => q.id === rq.id)) {
          target.questions.push(rq);
        }
      }
      if (ev.sourceScope === "FULL_TEXT") {
        target.hasFullTextEvidence = true;
      }
    }

    return Array.from(map.values());
  }, [libraryQuery.data, workspaceQuery.data, evidenceQuery.data]);

  const allTopics = useMemo(() => {
    const set = new Set<string>();
    for (const p of papers) {
      for (const t of p.themes) if (t.trim()) set.add(t.trim());
      if (p.collectionName?.trim()) set.add(p.collectionName.trim());
    }
    return Array.from(set).sort();
  }, [papers]);

  const allMethods = useMemo(() => {
    const set = new Set<string>();
    for (const p of papers) {
      for (const m of p.methodologies) if (m.trim()) set.add(m.trim());
    }
    return Array.from(set).sort();
  }, [papers]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of papers) {
      for (const tag of p.tags) if (tag.trim()) set.add(tag.trim());
    }
    return Array.from(set).sort();
  }, [papers]);

  const allQuestions = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of questionsQuery.data ?? []) map.set(q.id, q.text);
    for (const q of workspaceQuery.data?.questions ?? []) map.set(q.id, q.text);
    for (const p of papers) {
      for (const q of p.questions) map.set(q.id, q.text);
    }
    return Array.from(map.entries()).map(([id, text]) => ({ id, text }));
  }, [questionsQuery.data, workspaceQuery.data, papers]);

  const filteredPapers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return papers.filter((p) => {
      if (selectedTopic !== "ALL" && !p.themes.includes(selectedTopic) && p.collectionName !== selectedTopic) {
        return false;
      }
      if (selectedMethod !== "ALL" && !p.methodologies.includes(selectedMethod)) {
        return false;
      }
      if (selectedQuestionId !== "ALL" && !p.questions.some((rq) => rq.id === selectedQuestionId)) {
        return false;
      }
      if (selectedTag !== "ALL" && !p.tags.includes(selectedTag)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        p.title,
        p.journalName ?? "",
        p.authors.join(" "),
        p.tags.join(" "),
        p.themes.join(" "),
        p.methodologies.join(" "),
        p.claims.join(" "),
        p.limitations.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [papers, searchQuery, selectedTopic, selectedMethod, selectedQuestionId, selectedTag]);

  // Topic Clusters / Literature Map
  const clusters = useMemo(() => {
    const groups = new Map<string, { label: string; papers: EnrichedPaperItem[] }>();
    const addPaperToCluster = (key: string, label: string, paper: EnrichedPaperItem) => {
      const existing = groups.get(key);
      if (existing) {
        if (!existing.papers.some((item) => item.paperId === paper.paperId)) {
          existing.papers.push(paper);
        }
      } else {
        groups.set(key, { label, papers: [paper] });
      }
    };

    for (const p of filteredPapers) {
      if (groupBy === "topic") {
        const topics = p.themes.length > 0 ? p.themes : p.collectionName ? [p.collectionName] : ["Uncategorized Topic"];
        for (const t of topics) addPaperToCluster(t, t, p);
      } else if (groupBy === "methodology") {
        const methods = p.methodologies.length > 0 ? p.methodologies : ["Methodology Not Yet Extracted"];
        for (const m of methods) addPaperToCluster(m, m, p);
      } else if (groupBy === "question") {
        if (p.questions.length > 0) {
          for (const rq of p.questions) addPaperToCluster(rq.id, rq.text, p);
        } else {
          addPaperToCluster("unlinked-rq", "Not Yet Linked to a Research Question", p);
        }
      } else {
        const tags = p.tags.length > 0 ? p.tags : ["Untagged Papers"];
        for (const tag of tags) addPaperToCluster(tag, `#${tag}`, p);
      }
    }

    return Array.from(groups.entries()).map(([key, value]) => {
      const methodsSet = new Set<string>();
      const limitationsSet = new Set<string>();
      let verifiedCount = 0;
      for (const item of value.papers) {
        verifiedCount += item.verifiedCount;
        for (const m of item.methodologies) methodsSet.add(m);
        for (const lim of item.limitations) limitationsSet.add(lim);
      }
      return {
        key,
        label: value.label,
        papers: value.papers,
        verifiedCount,
        methods: Array.from(methodsSet),
        limitations: Array.from(limitationsSet),
      };
    });
  }, [filteredPapers, groupBy]);

  const comparedPapers = useMemo(
    () => papers.filter((p) => selectedPaperIds.includes(p.paperId)),
    [papers, selectedPaperIds]
  );

  // Check comparability across selected papers
  const comparabilityNotice = useMemo(() => {
    if (comparedPapers.length < 2) return null;
    const distinctPopulations = new Set(
      comparedPapers.flatMap((p) => p.populations.map((pop) => pop.trim().toLowerCase())).filter(Boolean)
    );
    const distinctMethods = new Set(
      comparedPapers.flatMap((p) => p.methodologies.map((m) => m.trim().toLowerCase())).filter(Boolean)
    );
    const hasAbstractOnly = comparedPapers.some((p) => !p.hasFullTextEvidence);
    return {
      differentConditions: distinctPopulations.size > 1 || distinctMethods.size > 1,
      hasAbstractOnly,
      populationCount: distinctPopulations.size,
      methodCount: distinctMethods.size,
    };
  }, [comparedPapers]);

  const toggleComparePaper = (paperId: string) => {
    setSelectedPaperIds((prev) => {
      if (prev.includes(paperId)) return prev.filter((id) => id !== paperId);
      if (prev.length >= 5) {
        toast.info("You can compare up to 5 papers side-by-side at once.");
        return prev;
      }
      return [...prev, paperId];
    });
  };

  const copyCitation = async (paper: EnrichedPaperItem) => {
    const key = buildCitationKey(paper.title, paper.authors, paper.publicationYear);
    const latex = `\\cite{${key}}`;
    try {
      await navigator.clipboard.writeText(latex);
      setCopiedCiteId(paper.paperId);
      toast.success(`Copied ${latex} to clipboard`);
      setTimeout(() => setCopiedCiteId(null), 2000);
    } catch {
      toast.error("Could not copy citation");
    }
  };

  const savePaperOrganization = async (paperId: string) => {
    const tags = tagDraft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await command.mutate(() =>
      researchApi.organize(projectId, paperId, {
        tags,
        collectionName: collectionDraft.trim() || null,
      })
    );
    setEditingTagsPaperId(null);
    void libraryQuery.refetch();
  };

  if (isLoading) return <WorkspaceLoading />;
  if (workspaceQuery.isError && libraryQuery.isError) {
    return <WorkspaceError error={workspaceQuery.error} retry={() => void workspaceQuery.refetch()} />;
  }

  return (
    <div className="space-y-6" data-no-i18n>
      {/* Header & Navigation */}
      <header className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25 text-xs font-bold">
                <FolderKanban className="mr-1.5 h-3.5 w-3.5" />
                Topic-Based Literature Review
              </Badge>
              <span className="text-xs text-muted-foreground">
                {papers.length} project paper{papers.length === 1 ? "" : "s"} · {clusters.length} cluster{clusters.length === 1 ? "" : "s"}
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground">
              Literature Map, Topic Clusters & Side-by-Side Comparison
            </h2>
            <p className="text-xs text-muted-foreground max-w-3xl">
              Organize papers by topic, keywords, methodology, and research questions. Select 2–5 studies to compare methodologies, findings, and limitations side-by-side before drafting your synthesis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=matrix`}>
                <Layers className="mr-1.5 h-3.5 w-3.5" />
                Evidence Matrix
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=limitations`}>
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                Limitations & Gaps
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={`/projects/${encodeURIComponent(projectId)}?tab=gaps&research=synthesis`}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Evidence-Backed Synthesis
              </Link>
            </Button>
          </div>
        </div>

        {/* Filter & Grouping Bar */}
        <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-2.5" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, author, keyword, method, claim…"
              className="h-8 w-full rounded-lg border border-border/80 bg-background pl-8 pr-3 text-xs"
              aria-label="Search literature clusters"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground shrink-0 font-medium">Group by:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
              className="h-8 flex-1 rounded-lg border border-border/80 bg-background px-2 text-xs font-semibold"
              aria-label="Group literature by"
            >
              <option value="topic">Topic / Theme</option>
              <option value="methodology">Methodology</option>
              <option value="question">Research Question</option>
              <option value="tag">Keywords / Tags</option>
            </select>
          </label>

          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs"
            aria-label="Filter by topic"
          >
            <option value="ALL">All Topics ({allTopics.length})</option>
            {allTopics.map((topic) => (
              <option key={topic} value={topic}>
                Topic: {topic}
              </option>
            ))}
          </select>

          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs"
            aria-label="Filter by methodology"
          >
            <option value="ALL">All Methodologies ({allMethods.length})</option>
            {allMethods.map((method) => (
              <option key={method} value={method}>
                Method: {method}
              </option>
            ))}
          </select>

          <select
            value={selectedQuestionId}
            onChange={(e) => setSelectedQuestionId(e.target.value)}
            className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs"
            aria-label="Filter by research question"
          >
            <option value="ALL">All Research Questions ({allQuestions.length})</option>
            {allQuestions.map((rq) => (
              <option key={rq.id} value={rq.id}>
                RQ: {rq.text.slice(0, 60)}
              </option>
            ))}
          </select>
        </div>

        {allTags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mr-1">
              <Filter className="h-3 w-3" /> Keywords / Tags:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTag("ALL")}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                selectedTag === "ALL"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(selectedTag === tag ? "ALL" : tag)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                  selectedTag === tag
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Side-by-Side Paper Comparison Panel */}
      {comparedPapers.length > 0 && (
        <section
          className="rounded-2xl border-2 border-indigo-500/30 bg-card p-5 shadow-sm space-y-4"
          aria-label="Side-by-side paper comparison"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-foreground">
                Side-by-Side Paper Comparison ({comparedPapers.length}/5 selected)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setSelectedPaperIds([])}
              >
                Clear Comparison
              </Button>
            </div>
          </div>

          {/* Methodological Comparability Guardrail */}
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5">
            <Scale className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">
                Methodological & Dataset Comparability Guardrail
              </p>
              <p className="leading-relaxed">
                {comparabilityNotice?.differentConditions
                  ? `Selected studies span ${comparabilityNotice.methodCount || "multiple"} methodology descriptions and ${comparabilityNotice.populationCount || "distinct"} datasets/populations. Do not declare a single method universally "best" when evaluation datasets, sample populations, or experimental conditions are not directly comparable.`
                  : "When comparing findings across studies, verify whether evaluation datasets, sample sizes, and metrics match before ranking one approach over another."}
                {comparabilityNotice?.hasAbstractOnly
                  ? " Note: At least one selected paper relies on abstract-only metadata without full-text evidence."
                  : ""}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left">
                  <th className="w-40 p-3 font-bold uppercase tracking-wider text-muted-foreground">
                    Dimension
                  </th>
                  {comparedPapers.map((p) => {
                    const citeKey = buildCitationKey(p.title, p.authors, p.publicationYear);
                    return (
                      <th key={p.paperId} className="p-3 align-top min-w-[220px] border-l border-border/60">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenPaper?.(p.paperId)}
                            className="text-left font-bold text-foreground hover:text-primary hover:underline line-clamp-2"
                          >
                            {p.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleComparePaper(p.paperId)}
                            className="text-[11px] text-muted-foreground hover:text-destructive shrink-0"
                            title="Remove from comparison"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
                          <span>{p.publicationYear ?? "n.d."}</span>
                          {p.journalName && <span>· {p.journalName}</span>}
                          <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-primary">
                            \cite&#123;{citeKey}&#125;
                          </code>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                <tr>
                  <td className="p-3 font-semibold text-muted-foreground align-top">
                    Evidence Coverage
                  </td>
                  {comparedPapers.map((p) => (
                    <td key={p.paperId} className="p-3 align-top border-l border-border/60">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          p.hasFullTextEvidence
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {p.hasFullTextEvidence ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <ShieldAlert className="h-3 w-3" />
                        )}
                        {p.hasFullTextEvidence ? "Full-Text Evidence" : "Abstract-Only"}
                      </span>
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        ({p.verifiedCount}/{p.extractionCount} verified)
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-semibold text-muted-foreground align-top">
                    Research Problem / Core Claims
                  </td>
                  {comparedPapers.map((p) => (
                    <td key={p.paperId} className="p-3 align-top border-l border-border/60">
                      {p.claims.length > 0 ? (
                        <ul className="list-disc pl-4 space-y-1 text-foreground">
                          {p.claims.map((c, idx) => (
                            <li key={idx}>{c}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground italic line-clamp-3">
                          {p.abstractText || "No extracted claims yet."}
                        </p>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-semibold text-muted-foreground align-top">
                    Methodology
                  </td>
                  {comparedPapers.map((p) => (
                    <td key={p.paperId} className="p-3 align-top border-l border-border/60">
                      {p.methodologies.length > 0 ? (
                        <ul className="list-disc pl-4 space-y-1 text-foreground">
                          {p.methodologies.map((m, idx) => (
                            <li key={idx}>{m}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground italic">Not yet extracted</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-semibold text-muted-foreground align-top">
                    Dataset / Population
                  </td>
                  {comparedPapers.map((p) => (
                    <td key={p.paperId} className="p-3 align-top border-l border-border/60">
                      {p.populations.length > 0 ? (
                        <ul className="list-disc pl-4 space-y-1 text-foreground">
                          {p.populations.map((pop, idx) => (
                            <li key={idx}>{pop}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground italic">Not specified in extractions</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-semibold text-muted-foreground align-top">
                    Key Findings & Results
                  </td>
                  {comparedPapers.map((p) => (
                    <td key={p.paperId} className="p-3 align-top border-l border-border/60">
                      {p.results.length > 0 ? (
                        <ul className="list-disc pl-4 space-y-1 text-foreground">
                          {p.results.map((r, idx) => (
                            <li key={idx}>{r}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground italic">Extract evidence to compare reported results</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-semibold text-muted-foreground align-top">
                    Limitations & Gaps
                  </td>
                  {comparedPapers.map((p) => (
                    <td key={p.paperId} className="p-3 align-top border-l border-border/60">
                      {p.limitations.length > 0 ? (
                        <ul className="list-disc pl-4 space-y-1 text-amber-800 dark:text-amber-300">
                          {p.limitations.map((lim, idx) => (
                            <li key={idx}>{lim}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground italic">None recorded yet</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-semibold text-muted-foreground align-top">
                    Traceable Actions
                  </td>
                  {comparedPapers.map((p) => (
                    <td key={p.paperId} className="p-3 align-top border-l border-border/60">
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => void copyCitation(p)}
                        >
                          <FileCode2 className="mr-1 h-3 w-3" />
                          {copiedCiteId === p.paperId ? "Copied" : "Copy \\cite"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          asChild
                        >
                          <Link
                            to={`/projects/${encodeURIComponent(projectId)}?tab=gaps&research=evidence&extract=${encodeURIComponent(p.paperId)}`}
                          >
                            <FileText className="mr-1 h-3 w-3" />
                            Extract Evidence
                          </Link>
                        </Button>
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Topic Clusters Grid */}
      {clusters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card p-10 text-center space-y-2">
          <BookOpen className="h-8 w-8 text-muted-foreground mx-auto" />
          <h3 className="text-base font-bold text-foreground">No matching papers in this view</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Add papers to your project library or clear active topic/methodology filters to view topic clusters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {clusters.map((cluster) => (
            <section
              key={cluster.key}
              className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                      {groupBy === "topic" && <Layers className="h-3.5 w-3.5" />}
                      {groupBy === "methodology" && <Compass className="h-3.5 w-3.5" />}
                      {groupBy === "question" && <HelpCircle className="h-3.5 w-3.5" />}
                      {groupBy === "tag" && <Tag className="h-3.5 w-3.5" />}
                      {cluster.label}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {cluster.papers.length} paper{cluster.papers.length === 1 ? "" : "s"} · {cluster.verifiedCount} verified evidence item{cluster.verifiedCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  {cluster.methods.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Methodologies in cluster:</strong>{" "}
                      {cluster.methods.slice(0, 4).join(" · ")}
                    </p>
                  )}
                </div>

                {cluster.papers.length >= 2 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() =>
                      setSelectedPaperIds(cluster.papers.slice(0, 5).map((p) => p.paperId))
                    }
                  >
                    <GitCompare className="h-3.5 w-3.5 text-indigo-500" />
                    Compare Cluster ({Math.min(cluster.papers.length, 5)})
                  </Button>
                )}
              </div>

              {/* Papers inside this Cluster */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {cluster.papers.map((paper) => {
                  const isSelected = selectedPaperIds.includes(paper.paperId);
                  const citeKey = buildCitationKey(paper.title, paper.authors, paper.publicationYear);
                  const isEditingTags = editingTagsPaperId === paper.paperId;

                  return (
                    <article
                      key={paper.paperId}
                      className={`rounded-xl border p-4 transition-all space-y-2.5 ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500/30"
                          : "border-border/75 bg-background/60 hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenPaper?.(paper.paperId)}
                            className="text-left text-sm font-bold text-foreground hover:text-primary hover:underline leading-snug"
                          >
                            {paper.title}
                          </button>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {paper.authors.length > 0
                              ? paper.authors.slice(0, 2).join(", ") +
                                (paper.authors.length > 2 ? " et al." : "")
                              : "Unknown authors"}{" "}
                            · {paper.publicationYear ?? "n.d."}
                            {paper.journalName ? ` · ${paper.journalName}` : ""}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            paper.hasFullTextEvidence
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {paper.hasFullTextEvidence ? "Full Text" : "Abstract Only"}
                        </span>
                      </div>

                      {/* Tags & Themes */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {paper.themes.map((th) => (
                          <span
                            key={th}
                            className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300"
                          >
                            {th}
                          </span>
                        ))}
                        {paper.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                          >
                            #{tag}
                          </span>
                        ))}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTagsPaperId(isEditingTags ? null : paper.paperId);
                              setTagDraft(paper.tags.join(", "));
                              setCollectionDraft(paper.collectionName ?? "");
                            }}
                            className="text-[11px] font-semibold text-muted-foreground hover:text-primary"
                          >
                            {isEditingTags ? "Cancel" : "+ Topic / Tag"}
                          </button>
                        )}
                      </div>

                      {isEditingTags && !readOnly && (
                        <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5 space-y-2 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={collectionDraft}
                              onChange={(e) => setCollectionDraft(e.target.value)}
                              placeholder="Topic cluster name (e.g. LLM Assessment)"
                              className="h-7 rounded border bg-background px-2 text-xs"
                            />
                            <input
                              type="text"
                              value={tagDraft}
                              onChange={(e) => setTagDraft(e.target.value)}
                              placeholder="Comma-separated tags (e.g. rag, rubric)"
                              className="h-7 rounded border bg-background px-2 text-xs"
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={command.isPending}
                            onClick={() => void savePaperOrganization(paper.paperId)}
                          >
                            Save Topic & Tags
                          </Button>
                        </div>
                      )}

                      {/* Extracted Methodology / Findings / Limitations Summary */}
                      {(paper.methodologies.length > 0 ||
                        paper.claims.length > 0 ||
                        paper.limitations.length > 0) && (
                        <div className="rounded-lg bg-muted/30 p-2.5 text-xs space-y-1">
                          {paper.methodologies[0] && (
                            <p className="truncate">
                              <strong className="text-foreground">Method:</strong>{" "}
                              <span className="text-muted-foreground">{paper.methodologies[0]}</span>
                            </p>
                          )}
                          {paper.claims[0] && (
                            <p className="line-clamp-2">
                              <strong className="text-foreground">Claim/Finding:</strong>{" "}
                              <span className="text-muted-foreground">{paper.claims[0]}</span>
                            </p>
                          )}
                          {paper.limitations[0] && (
                            <p className="line-clamp-1 text-amber-800 dark:text-amber-300">
                              <strong>Limitation:</strong> {paper.limitations[0]}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Actions Footer */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50">
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            className="h-7 px-2.5 text-xs gap-1"
                            onClick={() => toggleComparePaper(paper.paperId)}
                          >
                            <GitCompare className="h-3 w-3" />
                            <span>{isSelected ? "Comparing" : "Compare"}</span>
                          </Button>

                          {onOpenPaper && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs gap-1"
                              onClick={() => onOpenPaper(paper.paperId)}
                            >
                              <BookOpen className="h-3 w-3" />
                              <span>Read & Insight</span>
                            </Button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs gap-1 font-mono"
                            onClick={() => void copyCitation(paper)}
                            title={`Copy \\cite{${citeKey}}`}
                          >
                            {copiedCiteId === paper.paperId ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <FileCode2 className="h-3 w-3" />
                            )}
                            <span>\cite&#123;{citeKey}&#125;</span>
                          </Button>

                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                            <Link
                              to={`/projects/${encodeURIComponent(projectId)}?tab=gaps&research=evidence&extract=${encodeURIComponent(paper.paperId)}`}
                            >
                              Extract
                              <ArrowUpRight className="ml-0.5 h-3 w-3" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

