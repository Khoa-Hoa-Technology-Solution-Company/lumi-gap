import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { Loader2, Upload, FileText, X, AlertTriangle, Info } from "lucide-react";

function countWords(str: string) {
  return str
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w)).length;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function SubmitPaperPage({ isEmbedded = false }: { isEmbedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form states
  const [title, setTitle] = useState("");
  const [doi, setDoi] = useState("");
  const [paperLink, setPaperLink] = useState("");
  const [abstractText, setAbstractText] = useState("");
  const [publicationYear, setPublicationYear] = useState<string>(String(new Date().getFullYear()));
  const [paperKind, setPaperKind] = useState<"article" | "proceedings" | "preprint" | "review" | "book-chapter" | "other">("article");
  const [openAccessUrl, setOpenAccessUrl] = useState("");
  const [authorsStr, setAuthorsStr] = useState("");
  const [keywordsStr, setKeywordsStr] = useState("");
  const [topicsStr, setTopicsStr] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [existingPdfPath, setExistingPdfPath] = useState<string | null>(null);

  useEffect(() => {
    if (editId) {
      setLoading(true);
      api.get(`/papers/${editId}/edit`)
        .then((res) => {
          const paper = res.data.data;
          if (paper) {
            setTitle(paper.title || "");
            setDoi(paper.externalIds?.doi || paper.doi || "");
            setPaperLink(paper.paperLink || "");
            setAbstractText(paper.abstractText || "");
            setPublicationYear(paper.publicationYear ? String(paper.publicationYear) : String(new Date().getFullYear()));
            setPaperKind(paper.paperKind || "article");
            setOpenAccessUrl(paper.openAccessUrl || "");
            
            if (Array.isArray(paper.authors)) {
              setAuthorsStr(paper.authors.map((a: any) => a.displayName).join(", "));
            }
            if (Array.isArray(paper.keywords)) {
              setKeywordsStr(paper.keywords.map((k: any) => k.keywordName).join(", "));
            }
            if (Array.isArray(paper.topics)) {
              setTopicsStr(paper.topics.map((t: any) => t.topicName).join(", "));
            }
            if (paper.pdfPath) {
              setExistingPdfPath(paper.pdfPath);
            }
          }
        })
        .catch((err) => {
          console.error(err);
          toast.error("Failed to load paper details for editing");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [editId]);

  const abstractWordCount = countWords(abstractText);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file && file.type === "application/pdf") {
        setPdfFile(file);
        if (errors.pdf) setErrors((prev) => ({ ...prev, pdf: "" }));
      } else {
        toast.error("Only PDF files are allowed");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!title.trim() || title.trim().length < 8) {
      newErrors.title = "Please enter a clearer paper title (at least 8 characters).";
    }
    if (!doi.trim() || !/^10\.\d{4,9}\/\S+$/i.test(doi.trim())) {
      newErrors.doi = "Please enter a valid DOI (e.g. 10.1145/3065386).";
    }
    if (!paperLink.trim()) {
      newErrors.paperLink = "Please enter a valid paper link URL.";
    } else if (!isValidHttpUrl(paperLink)) {
      newErrors.paperLink = "Paper link must start with http:// or https://.";
    }
    if (openAccessUrl.trim() && !isValidHttpUrl(openAccessUrl)) {
      newErrors.openAccessUrl = "Open Access URL must start with http:// or https://.";
    }
    if (abstractWordCount < 50) {
      newErrors.abstractText = "Abstract must contain at least 50 words.";
    } else if (abstractWordCount > 350) {
      newErrors.abstractText = "Abstract must not exceed 350 words.";
    }

    const currentYear = new Date().getFullYear();
    const yearNum = parseInt(publicationYear, 10);
    if (!publicationYear || isNaN(yearNum) || yearNum < 1900) {
      newErrors.publicationYear = "Publication year must be 1900 or later.";
    } else if (yearNum > currentYear) {
      newErrors.publicationYear = "Publication year cannot be in the future.";
    }

    if (authorsStr.trim() === "") {
      newErrors.authors = "Please enter at least one author.";
    }
    if (keywordsStr.trim() === "") {
      newErrors.keywords = "Please enter at least one keyword.";
    }



    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Scroll to top error
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setLoading(true);

    try {
      const authors = authorsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((displayName, index) => ({
          displayName,
          position: index + 1,
          isCorresponding: index === 0,
        }));

      const keywords = keywordsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((keywordName) => ({ keywordName }));

      const topics = topicsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((topicName) => ({ topicName }));

      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("doi", doi.trim());
      formData.append("paperLink", paperLink.trim());
      formData.append("abstractText", abstractText.trim());
      formData.append("publicationYear", String(parseInt(publicationYear, 10)));
      formData.append("paperKind", paperKind);
      formData.append("authors", JSON.stringify(authors));
      formData.append("keywords", JSON.stringify(keywords));
      formData.append("topics", JSON.stringify(topics));

      if (openAccessUrl.trim()) formData.append("openAccessUrl", openAccessUrl.trim());
      if (pdfFile) formData.append("pdf", pdfFile);

      const res = editId
        ? await api.patch(`/papers/${editId}`, formData)
        : await api.post("/papers", formData);

      if (res.data.success) {
        if (isAdmin) {
          toast.success(pdfFile
            ? "Paper and PDF added to the public corpus."
            : "Metadata-only paper added. A PDF can be uploaded later.");
        } else if (editId) {
          toast.success("Paper resubmitted successfully! It will be reviewed by the admin.");
        } else {
          toast.success("Paper submitted successfully! It will be reviewed by the admin before being published.");
        }
        navigate(isAdmin ? "/admin/papers" : "/settings/my-papers");
      }
    } catch (error: any) {
      console.error("Submit paper failed:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      const errMsg =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        "Failed to submit paper. Please check input parameters.";
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className={isEmbedded ? "space-y-6" : "p-8 space-y-6"}>
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
              Paper Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((prev) => ({ ...prev, title: "" }));
              }}
              placeholder="e.g. Attention Is All You Need"
              className={`flex h-10 w-full rounded-md border bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all ${
                errors.title
                  ? "border-red-500 focus:ring-red-500"
                  : "border-slate-300 dark:border-zinc-800"
              }`}
            />
            {errors.title && <p className="text-xs text-red-500 font-medium mt-1">{errors.title}</p>}
          </div>

          {/* DOI & Paper Link — both required */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="doi" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                DOI <span className="text-red-500">*</span>
              </label>
              <input
                id="doi"
                required
                value={doi}
                onChange={(e) => {
                  setDoi(e.target.value);
                  if (errors.doi) setErrors((prev) => ({ ...prev, doi: "" }));
                }}
                placeholder="e.g. 10.1145/3065386"
                className={`flex h-10 w-full rounded-md border bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all ${
                  errors.doi
                    ? "border-red-500 focus:ring-red-500"
                    : "border-slate-300 dark:border-zinc-800"
                }`}
              />
              {errors.doi && <p className="text-xs text-red-500 font-medium mt-1">{errors.doi}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="paperLink" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                Paper Link <span className="text-red-500">*</span>
              </label>
              <input
                id="paperLink"
                required
                value={paperLink}
                onChange={(e) => {
                  setPaperLink(e.target.value);
                  if (errors.paperLink) setErrors((prev) => ({ ...prev, paperLink: "" }));
                }}
                placeholder="e.g. https://arxiv.org/abs/1706.03762"
                className={`flex h-10 w-full rounded-md border bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all ${
                  errors.paperLink
                    ? "border-red-500 focus:ring-red-500"
                    : "border-slate-300 dark:border-zinc-800"
                }`}
              />
              {errors.paperLink && <p className="text-xs text-red-500 font-medium mt-1">{errors.paperLink}</p>}
            </div>
          </div>

          {/* Open Access URL */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="openAccessUrl" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
              Open Access URL <span className="text-slate-400 font-normal text-xs">(optional)</span>
            </label>
            <input
              id="openAccessUrl"
              value={openAccessUrl}
              onChange={(e) => {
                setOpenAccessUrl(e.target.value);
                if (errors.openAccessUrl) setErrors((prev) => ({ ...prev, openAccessUrl: "" }));
              }}
              placeholder="e.g. https://arxiv.org/pdf/1706.03762.pdf"
              className={`flex h-10 w-full rounded-md border bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all ${
                errors.openAccessUrl
                  ? "border-red-500 focus:ring-red-500"
                  : "border-slate-300 dark:border-zinc-800"
              }`}
            />
            {errors.openAccessUrl && <p className="text-xs text-red-500 font-medium mt-1">{errors.openAccessUrl}</p>}
          </div>

          {/* Abstract */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="abstractText" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
              Abstract <span className="text-red-500">*</span>
            </label>
            <textarea
              id="abstractText"
              required
              rows={6}
              value={abstractText}
              onChange={(e) => {
                setAbstractText(e.target.value);
                if (errors.abstractText) setErrors((prev) => ({ ...prev, abstractText: "" }));
              }}
              placeholder="Paste the abstract here (between 50 and 350 words)..."
              className={`flex w-full rounded-md border bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all ${
                errors.abstractText
                  ? "border-red-500 focus:ring-red-500"
                  : "border-slate-300 dark:border-zinc-800"
              }`}
            />
            {errors.abstractText && <p className="text-xs text-red-500 font-medium mt-1">{errors.abstractText}</p>}
            <p className={`text-xs ${
              abstractWordCount < 50 || abstractWordCount > 350
                ? "text-red-500"
                : "text-slate-500"
            }`}>
              {abstractWordCount} / 50–350 words
            </p>
          </div>

          {/* Kind & Year */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="paperKind" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                Paper Kind <span className="text-red-500">*</span>
              </label>
              <select
                id="paperKind"
                value={paperKind}
                onChange={(e) => setPaperKind(e.target.value as any)}
                className="flex h-10 w-full rounded-md border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all"
              >
                <option value="article">Article / Research Paper</option>
                <option value="proceedings">Conference Proceedings</option>
                <option value="preprint">Preprint</option>
                <option value="review">Review</option>
                <option value="book-chapter">Book Chapter</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="publicationYear" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                Publication Year <span className="text-red-500">*</span>
              </label>
              <input
                id="publicationYear"
                type="number"
                required
                min={1900}
                max={new Date().getFullYear()}
                placeholder={String(new Date().getFullYear())}
                value={publicationYear}
                onChange={(e) => {
                  const val = e.target.value.replace(/^0+(?=\d)/, "");
                  setPublicationYear(val);
                  if (errors.publicationYear) setErrors((prev) => ({ ...prev, publicationYear: "" }));
                }}
                className={`flex h-10 w-full rounded-md border bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all ${
                  errors.publicationYear
                    ? "border-red-500 focus:ring-red-500"
                    : "border-slate-300 dark:border-zinc-800"
                }`}
              />
              {errors.publicationYear && <p className="text-xs text-red-500 font-medium mt-1">{errors.publicationYear}</p>}
            </div>
          </div>

          {/* Authors */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="authors" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
              Authors (comma-separated) <span className="text-red-500">*</span>
            </label>
            <input
              id="authors"
              required
              value={authorsStr}
              onChange={(e) => {
                setAuthorsStr(e.target.value);
                if (errors.authors) setErrors((prev) => ({ ...prev, authors: "" }));
              }}
              placeholder="e.g. Ashish Vaswani, Noam Shazeer, Niki Parmar"
              className={`flex h-10 w-full rounded-md border bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all ${
                errors.authors
                  ? "border-red-500 focus:ring-red-500"
                  : "border-slate-300 dark:border-zinc-800"
              }`}
            />
            {errors.authors && <p className="text-xs text-red-500 font-medium mt-1">{errors.authors}</p>}
            <p className="text-xs text-slate-500">First author will be marked as corresponding author.</p>
          </div>

          {/* Keywords & Topics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="keywords" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                Keywords <span className="text-red-500">*</span>
              </label>
              <input
                id="keywords"
                required
                value={keywordsStr}
                onChange={(e) => {
                  setKeywordsStr(e.target.value);
                  if (errors.keywords) setErrors((prev) => ({ ...prev, keywords: "" }));
                }}
                placeholder="e.g. NLP, Transformers, Deep Learning"
                className={`flex h-10 w-full rounded-md border bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all ${
                  errors.keywords
                    ? "border-red-500 focus:ring-red-500"
                    : "border-slate-300 dark:border-zinc-800"
                }`}
              />
              {errors.keywords && <p className="text-xs text-red-500 font-medium mt-1">{errors.keywords}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="topics" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                Research Topics <span className="text-slate-400 font-normal text-xs">(optional)</span>
              </label>
              <input
                id="topics"
                value={topicsStr}
                onChange={(e) => setTopicsStr(e.target.value)}
                placeholder="e.g. Computer Science, AI"
                className="flex h-10 w-full rounded-md border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* PDF Upload — Optional */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-900 dark:text-slate-200">
              PDF Document <span className="text-slate-400 font-normal text-xs">(optional)</span>
            </label>
            {pdfFile ? (
              <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium truncate max-w-xs">{pdfFile.name}</span>
                    <span className="text-xs text-slate-500">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null);
                    if (errors.pdf) setErrors((prev) => ({ ...prev, pdf: "" }));
                  }}
                  className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : existingPdfPath ? (
              <div className="flex items-center justify-between p-3 rounded-lg border border-indigo-200 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-800 dark:text-indigo-400">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium truncate max-w-xs">Existing PDF Document</span>
                    <span className="text-xs text-slate-500">You can upload a new PDF to replace it</span>
                  </div>
                </div>
                <label
                  htmlFor="pdf-upload"
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 cursor-pointer"
                >
                  Replace PDF
                </label>
                <input id="pdf-upload" type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
              </div>
            ) : (
              <label
                htmlFor="pdf-upload"
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 bg-slate-50/50 dark:bg-zinc-900/30 cursor-pointer transition-all group ${
                  errors.pdf
                    ? "border-red-500 hover:border-red-600"
                    : "border-slate-300 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-400/50"
                }`}
              >
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mb-2 transition-colors" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Click to upload PDF</span>
                <span className="text-xs text-slate-500 mt-1">PDF only (Max 10MB)</span>
                <input id="pdf-upload" type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
              </label>
            )}
            {errors.pdf && <p className="text-xs text-red-500 font-medium mt-1">{errors.pdf}</p>}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800">
            <Button type="button" variant="outline" disabled={loading} onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white shadow-md transition-all hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {editId ? "Resubmitting..." : isAdmin ? "Creating..." : "Submitting..."}
                </>
              ) : (
                <>{editId ? "Resubmit Paper" : isAdmin ? "Create Paper" : "Submit Paper"}</>
              )}
            </Button>
          </div>
        </form>
      );

      if (isEmbedded) {
        return (
          <div className="space-y-6">
            <div className="mb-6 pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                {editId ? "Edit & Resubmit Paper" : isAdmin ? "Add Paper to Corpus" : "Direct Submission"}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {editId
                  ? "Edit your paper details and re-upload the PDF to address admin feedback."
                  : isAdmin
                    ? "Create a public paper from metadata now. The PDF is optional and can be attached from Paper Detail later."
                    : "Directly submit scientific papers with PDF files. Papers will be automatically scored upon submission and points rewarded once approved by the Admin."}
              </p>
            </div>
            {formContent}
          </div>
        );
      }

      return (
        <main className="container py-8 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center space-y-3 mb-10">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              {editId ? "Edit & Resubmit Paper" : isAdmin ? "Add Paper to Corpus" : "Direct Submission"}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
              {editId
                ? "Edit your paper details and re-upload the PDF to address admin feedback."
                : isAdmin
                  ? "Create a public metadata-only paper, or attach a PDF now. No admin credit is charged."
                  : "Directly submit scientific papers with PDF files. Papers will be automatically scored upon submission and points rewarded once approved by the Admin."}
            </p>
          </div>

          {/* Form */}
          <div className="relative bg-white dark:bg-[#0e0e11] border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xl overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 via-[#001b69] to-indigo-600" />
            {formContent}
          </div>
        </main>
      );
    }
