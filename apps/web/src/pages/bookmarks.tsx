import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBookmarks, useDeleteBookmark, useUpdateBookmarkNote } from "@/features/bookmarks";
import { Bookmark, Search, FileText, Sparkles, Pencil, Trash2, FileDown, Quote } from "lucide-react";
import { toast } from "sonner";

export function BookmarksPage() {
  const { data: bookmarks, isLoading } = useBookmarks();
  const deleteBookmark = useDeleteBookmark();
  const updateNote = useUpdateBookmarkNote();

  const [activeTab, setActiveTab] = useState<"all" | "paper" | "report">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Edit Note Modal State
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");

  const handleOpenEditNote = (id: string, note?: string | null) => {
    setEditingBookmarkId(id);
    setEditingNoteValue(note || "");
  };

  const handleSaveNote = () => {
    if (!editingBookmarkId) return;
    updateNote.mutate(
      { id: editingBookmarkId, note: editingNoteValue },
      {
        onSuccess: () => {
          toast.success("Bookmark note updated successfully!");
          setEditingBookmarkId(null);
        },
        onError: () => {
          toast.error("Failed to update bookmark note.");
        },
      }
    );
  };

  const handleDeleteBookmark = (id: string, targetKind: "paper" | "report", targetId: string) => {
    if (confirm("Are you sure you want to remove this item from your library?")) {
      deleteBookmark.mutate(
        { id, targetKind, targetId },
        {
          onSuccess: () => {
            toast.success("Removed from library.");
          },
          onError: () => {
            toast.error("Failed to remove from library.");
          },
        }
      );
    }
  };

  // Filter out orphaned bookmarks (where paper or report details are missing)
  const validBookmarks = bookmarks?.filter((b) => {
    if (b.targetKind === "paper") return !!b.paperDetail;
    if (b.targetKind === "report") return !!b.reportDetail;
    return false;
  }) || [];

  // Filter and Search logic
  const filteredBookmarks = validBookmarks.filter((b) => {
    // 1. Tab filter
    if (activeTab !== "all" && b.targetKind !== activeTab) return false;

    // 2. Search query filter
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();

    if (b.targetKind === "paper" && b.paperDetail) {
      return (
        b.paperDetail.title.toLowerCase().includes(query) ||
        b.paperDetail.journalName?.toLowerCase().includes(query) ||
        b.paperDetail.abstractText?.toLowerCase().includes(query) ||
        b.note?.toLowerCase().includes(query)
      );
    }

    if (b.targetKind === "report" && b.reportDetail) {
      return (
        b.reportDetail.topic?.toLowerCase().includes(query) ||
        b.reportDetail.query.toLowerCase().includes(query) ||
        b.note?.toLowerCase().includes(query)
      );
    }

    return false;
  });

  return (
    <main className="container py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="My Library"
        description="Manage saved papers and AI reports."
      />

      {/* Toolbar / Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
        {/* Tabs */}
        <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800/60 p-1 self-start md:self-auto">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 text-xs font-bold rounded-md transition-all duration-200 ${
              activeTab === "all"
                ? "bg-white dark:bg-slate-900 shadow text-blue-700 dark:text-blue-400"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            All ({validBookmarks.length})
          </button>
          <button
            onClick={() => setActiveTab("paper")}
            className={`px-4 py-2 text-xs font-bold rounded-md transition-all duration-200 ${
              activeTab === "paper"
                ? "bg-white dark:bg-slate-900 shadow text-blue-700 dark:text-blue-400"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            Papers ({validBookmarks.filter((b) => b.targetKind === "paper").length})
          </button>
          <button
            onClick={() => setActiveTab("report")}
            className={`px-4 py-2 text-xs font-bold rounded-md transition-all duration-200 ${
              activeTab === "report"
                ? "bg-white dark:bg-slate-900 shadow text-blue-700 dark:text-blue-400"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            Reports ({validBookmarks.filter((b) => b.targetKind === "report").length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search saved items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 border-slate-200 dark:border-slate-800 rounded-lg text-xs"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse border-slate-200 dark:border-slate-800">
              <CardHeader className="h-28 bg-slate-50 dark:bg-slate-900/40" />
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      ) : filteredBookmarks && filteredBookmarks.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredBookmarks.map((bookmark) => {
            const { id, targetKind, targetId, note, createdAt } = bookmark;

            if (targetKind === "paper" && bookmark.paperDetail) {
              const paper = bookmark.paperDetail;
              return (
                <Card key={id} className="flex flex-col justify-between border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] hover:shadow-md transition-shadow duration-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <FileText className="w-3.5 h-3.5 text-blue-500" />
                        <span>Paper</span>
                        <span>•</span>
                        <span>Saved {new Date(createdAt).toLocaleDateString()}</span>
                      </div>
                      {paper.openAccessUrl && (
                        <Badge className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-[9px] uppercase tracking-wider rounded">
                          Open Access
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white leading-snug hover:underline cursor-pointer">
                      <Link to={`/papers/${paper.id}`}>{paper.title}</Link>
                    </CardTitle>
                    <CardDescription className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-1">
                      {paper.journalName ? `${paper.journalName} (${paper.publicationYear})` : `Published ${paper.publicationYear}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-3 flex-grow">
                    <p className="text-xs text-slate-500 line-clamp-3 mb-4 text-justify">
                      {paper.abstractText || "No abstract available for this paper."}
                    </p>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {paper.authors.slice(0, 4).map((author, index) => (
                        <Badge key={index} variant="secondary" className="text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {author.displayName}
                        </Badge>
                      ))}
                      {paper.authors.length > 4 && (
                        <Badge variant="secondary" className="text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                          +{paper.authors.length - 4} others
                        </Badge>
                      )}
                    </div>

                    {note && (
                      <div className="mt-3 p-3 rounded-lg bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 italic flex flex-col gap-1">
                        <span className="font-bold text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-500 not-italic">Note:</span>
                        <p className="whitespace-pre-wrap">{note}</p>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 gap-1.5 text-xs font-bold"
                        onClick={() => handleOpenEditNote(id, note)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {note ? "Edit Note" : "Add Note"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-red-500 hover:text-red-600 dark:hover:text-red-400 gap-1.5 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-500/10"
                        onClick={() => handleDeleteBookmark(id, "paper", targetId)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      {paper.openAccessUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-[11px] font-bold border-slate-200 dark:border-slate-800 gap-1"
                          onClick={() => window.open(paper.openAccessUrl, "_blank")}
                        >
                          <FileDown className="w-3 h-3" />
                          PDF
                        </Button>
                      )}
                      <Button asChild size="sm" className="h-8 text-[11px] font-bold bg-blue-800 hover:bg-blue-900 text-white">
                        <Link to={`/papers/${paper.id}`}>View Details</Link>
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            }

            if (targetKind === "report" && bookmark.reportDetail) {
              const report = bookmark.reportDetail;
              return (
                <Card key={id} className="flex flex-col justify-between border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] hover:shadow-md transition-shadow duration-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                        <span>AI Report</span>
                        <span>•</span>
                        <span>Saved {new Date(createdAt).toLocaleDateString()}</span>
                      </div>
                      <Badge className="bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 text-[9px] uppercase tracking-wider rounded">
                        {report.status}
                      </Badge>
                    </div>
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white leading-snug hover:underline cursor-pointer">
                      <Link to={`/reports/${report.id}`}>{report.topic || "AI Research Analysis"}</Link>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <span>{report.topic || "Analysis Report"}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-3 flex-grow">
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg text-xs text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800/60 mb-4">
                      <span className="font-bold text-[9px] uppercase tracking-wider text-slate-400 block mb-1">Query:</span>
                      <p className="line-clamp-2">"{report.query}"</p>
                    </div>

                    {note && (
                      <div className="mt-3 p-3 rounded-lg bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 italic flex flex-col gap-1">
                        <span className="font-bold text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-500 not-italic">Note:</span>
                        <p className="whitespace-pre-wrap">{note}</p>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 gap-1.5 text-xs font-bold"
                        onClick={() => handleOpenEditNote(id, note)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {note ? "Edit Note" : "Add Note"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-red-500 hover:text-red-600 dark:hover:text-red-400 gap-1.5 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-500/10"
                        onClick={() => handleDeleteBookmark(id, "report", targetId)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </Button>
                    </div>

                    <Button asChild size="sm" className="h-8 text-[11px] font-bold bg-cyan-700 hover:bg-cyan-800 text-white">
                      <Link to={`/reports/${report.id}`}>Open Report</Link>
                    </Button>
                  </CardFooter>
                </Card>
              );
            }

            return null;
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-20 bg-slate-50 dark:bg-slate-900/10 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl mx-auto mt-12 px-6">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-600 flex items-center justify-center mx-auto mb-6">
            <Bookmark className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">Library is empty</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-8">
            {searchQuery
              ? `No items found matching "${searchQuery}".`
              : "Save papers or AI reports here for quick access."}
          </p>
          {!searchQuery && (
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild size="sm" className="font-bold bg-blue-800 hover:bg-blue-900 text-white rounded-lg">
                <Link to="/search">Explore Papers</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="font-bold border-slate-300 dark:border-slate-700 rounded-lg">
                <Link to="/trends">Analyze Trends</Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Edit Note Dialog */}
      <Dialog open={editingBookmarkId !== null} onOpenChange={(open) => !open && setEditingBookmarkId(null)}>
        <DialogContent className="max-w-md border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-slate-900 dark:text-white">Edit Note</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Add a description, tags, or annotation to your saved item.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <textarea
              className="w-full h-32 p-3 text-xs border border-slate-200 dark:border-slate-800 bg-transparent dark:bg-slate-950/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
              placeholder="Write personal notes (max 500 characters)..."
              maxLength={500}
              value={editingNoteValue}
              onChange={(e) => setEditingNoteValue(e.target.value)}
            />
            <div className="text-right text-[10px] text-slate-400 mt-1">
              {editingNoteValue.length}/500 characters
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="font-bold border-slate-300 dark:border-slate-700 rounded-lg text-xs"
              onClick={() => setEditingBookmarkId(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="font-bold bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs"
              onClick={handleSaveNote}
              disabled={updateNote.isPending}
            >
              {updateNote.isPending ? "Saving..." : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
