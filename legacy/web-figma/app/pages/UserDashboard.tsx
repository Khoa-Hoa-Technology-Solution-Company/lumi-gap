import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { AppHeader } from '../components/AppHeader';
import { StatsCard } from '../components/StatsCard';
import { StatusBadge } from '../components/StatusBadge';
import { PaperCard } from '../components/PaperCard';
import { LoadingSkeleton } from '../components/LoadingSpinner';
import { SuccessToast } from '../components/SuccessToast';
import { apiRequest, resolveFileUrl } from '../lib/api';
import { PublicPaper } from '../lib/papers';
import { Search, Plus, Download as DownloadIcon, Filter } from 'lucide-react';

type FeedTab = 'newest' | 'rating' | 'downloads' | 'hasPdf';

const feedTabs: Array<{ label: string; value: FeedTab }> = [
  { label: 'Latest', value: 'newest' },
  { label: 'Top Rated', value: 'rating' },
  { label: 'Most Downloaded', value: 'downloads' },
  { label: 'Has PDF', value: 'hasPdf' },
];

export function UserDashboard() {
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

  useEffect(() => {
    if (!message) return;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

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

      const data = await apiRequest<{ papers: PublicPaper[]; pagination?: { totalPages?: number } }>(`/public-papers?${params.toString()}`, {
        auth: true,
      });
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

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-[#f6efe7] bg-fixed">
      <Sidebar role="user" />

      <div className="min-w-0 flex-1">
        <AppHeader role="user" />
        <div className="p-5">
          <div className="max-w-7xl mx-auto">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-foreground mb-2">Dashboard</h1>
                <p className="text-[#7d6d60]">Browse research papers and request what you need.</p>
              </div>

              <button
                onClick={() => navigate('/request-paper')}
                className="inline-flex items-center gap-2 self-start rounded-lg bg-[#2f251f] px-4 py-2 text-[#fffaf4] transition-colors hover:bg-[#1f1a17] lg:self-auto"
              >
                <Plus size={20} />
                Request Paper
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#dfd4c7] bg-[#fffaf4] p-2 shadow-sm">
              <span className="px-3 text-sm font-medium text-[#7d6d60]">Filter by</span>
              {feedTabs.map((item) => {
                const isActive = activeTab === item.value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setPage(1);
                      setActiveTab(item.value);
                    }}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-[#2f251f] text-[#fffaf4] shadow-sm'
                        : 'bg-[#f4ebe1] text-[#7b5b3a] hover:bg-[#ead9c7] hover:text-[#5e4630]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
              {error}
            </div>
          )}

          {message && (
            <SuccessToast message={message} onDismiss={() => setMessage('')} />
          )}

            <div className="mb-4 rounded-lg border border-[#dfd4c7] bg-[#fffaf4] p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#8a7b6f]" size={20} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setPage(1);
                    setSearchTerm(e.target.value);
                  }}
                  placeholder="Search by title, author, DOI, keywords, or type..."
                  maxLength={128}
                  className="w-full pl-10 pr-4 py-3 border border-[#d8c8b7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#d7c7b3] bg-[#fffdf9]"
                />
              </div>
              <div className="relative lg:w-48">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#8a7b6f]" size={20} />
                <select
                  value={yearFilter}
                  onChange={(e) => {
                    setPage(1);
                    setYearFilter(e.target.value);
                  }}
                  className="pl-10 pr-8 py-3 border border-[#d8c8b7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#d7c7b3] bg-[#fffdf9] appearance-none"
                >
                  <option value="all">All Years</option>
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-[#7d6d60]">
                {isLoading ? 'Loading papers...' : `Showing ${papers.length} paper${papers.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          {isLoading ? (
            <LoadingSkeleton rows={5} />
          ) : papers.length === 0 ? (
            <div className="bg-[#fffaf4] rounded-lg border border-[#dfd4c7] shadow-sm p-12 text-center">
              <Search size={48} className="mx-auto text-[#9a897a] mb-4" />
              <h3 className="text-[#1f1a17] mb-2">No papers found</h3>
              <p className="text-[#7d6d60]">
                Try adjusting your search terms or filters.
              </p>
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
                <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-[#dfd4c7] bg-[#fffaf4] px-3 py-2 shadow-sm">
                  <p className="text-sm text-[#7d6d60]">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                      disabled={page === 1 || isLoading}
                      className="rounded-lg border border-[#d8c8b7] px-3 py-2 text-sm font-medium text-[#1f1a17] transition-colors hover:bg-[#f3ebe1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                      disabled={page === totalPages || isLoading}
                      className="rounded-lg bg-[#2f251f] px-3 py-2 text-sm font-medium text-[#fffaf4] transition-colors hover:bg-[#1f1a17] disabled:cursor-not-allowed disabled:opacity-50"
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
