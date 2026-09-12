import type React from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { AppHeader } from '../components/AppHeader';
import { SubNavbar } from '../components/SubNavbar';
import { PaperCard } from '../components/PaperCard';
import { LoadingSkeleton } from '../components/LoadingSpinner';
import { SuccessToast } from '../components/SuccessToast';
import { apiRequest, resolveFileUrl } from '../lib/api';
import { PublicPaper } from '../lib/papers';
import { postSystemAnnouncement } from '../lib/notifications';
import { Filter, Megaphone, Plus, Search, Send, X } from 'lucide-react';

type FeedTab = 'newest' | 'rating' | 'downloads' | 'hasPdf';

const feedTabs: Array<{ label: string; value: FeedTab }> = [
  { label: 'Latest', value: 'newest' },
  { label: 'Top Rated', value: 'rating' },
  { label: 'Most Downloaded', value: 'downloads' },
  { label: 'Has PDF', value: 'hasPdf' },
];

export function AdminBrowseDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<FeedTab>('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [papers, setPapers] = useState<PublicPaper[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);

  useEffect(() => {
    if (!message) return;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    if (location.state?.loginSuccess) {
      setMessage('Logged in successfully.');
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    if (typeof location.state?.headerSearch === 'string') {
      setSearchTerm(location.state.headerSearch);
      setPage(1);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  async function loadPapers() {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (yearFilter !== 'all') params.set('year', yearFilter);
      if (activeTab === 'hasPdf') {
        params.set('hasPdf', 'true');
        params.set('sortBy', 'newest');
      } else {
        params.set('sortBy', activeTab);
      }
      params.set('page', String(page));
      params.set('limit', '5');

      const data = await apiRequest<{ papers: PublicPaper[]; pagination?: { totalPages?: number } }>(
        `/public-papers?${params.toString()}`,
        { auth: true }
      );
      setPapers(data.papers);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load papers');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadPapers();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [page, searchTerm, yearFilter, activeTab]);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (searchTerm) params.set('search', searchTerm);
        if (activeTab === 'hasPdf') params.set('hasPdf', 'true');

        const data = await apiRequest<{ years: string[] }>(`/public-papers/years?${params.toString()}`, {
          auth: true,
        });
        setYears(data.years);
      } catch {
        setYears([]);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm, activeTab]);

  const handleDownload = async (paper: PublicPaper) => {
    try {
      const data = await apiRequest<{ downloadUrl: string }>(`/public-papers/${paper._id}/download`, {
        method: 'POST',
        auth: true,
      });

      const fileUrl = resolveFileUrl(data.downloadUrl);
      const resp = await fetch(fileUrl);
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${paper.doi || paper.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download PDF');
    }
  };

  const handlePostAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const title = announcementTitle.trim();
    const announcement = announcementMessage.trim();

    if (title.length < 3 || announcement.length < 5) {
      setError('Please enter an announcement title and message.');
      return;
    }

    setIsPostingAnnouncement(true);

    try {
      const result = await postSystemAnnouncement({ title, message: announcement });
      setAnnouncementTitle('');
      setAnnouncementMessage('');
      setShowAnnouncement(false);
      setMessage(`Announcement sent to ${result.createdCount} user${result.createdCount === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post announcement');
    } finally {
      setIsPostingAnnouncement(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-surface-workspace bg-fixed">
      <Sidebar role="admin" />

      <div className="min-w-0 flex-1">
        <AppHeader role="admin" />
        <div className="p-5">
          <div className="mx-auto max-w-7xl">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="mb-2 text-foreground">Dashboard</h1>
                <p className="text-muted-foreground">Browse published papers, post new papers, and send announcements.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowAnnouncement((current) => !current)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Megaphone size={20} />
                  Announcement
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/admin/post-paper')}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-blue-600"
                >
                  <Plus size={20} />
                  Post Paper
                </button>
              </div>
            </div>

            <SubNavbar
              items={feedTabs}
              activeValue={activeTab}
              onSelect={(value) => {
                setPage(1);
                setActiveTab(value as FeedTab);
              }}
              title="Filter by"
            />

            {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

            {message && (
              <SuccessToast message={message} onDismiss={() => setMessage('')} />
            )}

            {showAnnouncement && (
              <form
                onSubmit={handlePostAnnouncement}
                className="mb-4 rounded-lg border border-border bg-white p-4 shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-foreground">Post Announcement</h2>
                    <p className="text-sm text-muted-foreground">Send a notification to all active users.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAnnouncement(false)}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Close announcement form"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.45fr)_minmax(320px,1fr)_auto]">
                  <input
                    type="text"
                    value={announcementTitle}
                    onChange={(event) => setAnnouncementTitle(event.target.value)}
                    maxLength={120}
                    placeholder="Announcement title"
                    className="rounded-lg border border-border bg-input-background px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <textarea
                    value={announcementMessage}
                    onChange={(event) => setAnnouncementMessage(event.target.value)}
                    maxLength={500}
                    rows={1}
                    placeholder="Write the announcement..."
                    className="min-h-[52px] rounded-lg border border-border bg-input-background px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isPostingAnnouncement}
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Send size={18} />
                    {isPostingAnnouncement ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </form>
            )}

            <div className="mb-4 rounded-lg border border-border bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => {
                      setPage(1);
                      setSearchTerm(event.target.value);
                    }}
                    placeholder="Search by title, author, DOI, keywords, or type..."
                    maxLength={128}
                    className="w-full rounded-lg border border-border bg-input-background py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="relative lg:w-48">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                  <select
                    value={yearFilter}
                    onChange={(event) => {
                      setPage(1);
                      setYearFilter(event.target.value);
                    }}
                    className="w-full appearance-none rounded-lg border border-border bg-input-background py-3 pl-10 pr-8 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">All Years</option>
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="mt-2 text-sm text-muted-foreground">
                {isLoading ? 'Loading papers...' : `Showing ${papers.length} paper${papers.length !== 1 ? 's' : ''}`}
              </p>
            </div>

            {isLoading ? (
              <LoadingSkeleton rows={5} />
            ) : papers.length === 0 ? (
              <div className="rounded-lg border border-border bg-white p-12 text-center shadow-sm">
                <Search size={48} className="mx-auto mb-4 text-muted-foreground" />
                <h3 className="mb-2 text-foreground">No papers found</h3>
                <p className="text-muted-foreground">Try adjusting your search terms or filters.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {papers.map((paper) => (
                    <PaperCard
                      key={paper._id}
                      paper={paper}
                      variant="dashboard"
                      onOpen={(selectedPaper) => navigate(`/paper/${selectedPaper._id}`)}
                      onDownload={handleDownload}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2 shadow-sm">
                    <p className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                        disabled={page === 1 || isLoading}
                        className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                        disabled={page === totalPages || isLoading}
                        className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
