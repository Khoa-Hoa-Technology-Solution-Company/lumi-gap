import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { AppHeader } from '../components/AppHeader';
import { Search, Download, Eye, Calendar, Filter, Star } from 'lucide-react';
import { apiRequest, resolveFileUrl } from '../lib/api';
import { getPaperAuthors, getPaperType, PublicPaper } from '../lib/papers';
import ExpandableText from '../components/ExpandableText';

export function SearchPapersPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [years, setYears] = useState<string[]>([]);
  const [papers, setPapers] = useState<PublicPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadPapers() {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (yearFilter !== 'all') params.set('year', yearFilter);
      params.set('sortBy', 'newest');
      params.set('limit', '100');

      const data = await apiRequest<{ papers: PublicPaper[] }>(`/public-papers?${params.toString()}`, {
        auth: true,
      });
      setPapers(data.papers);
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
  }, [searchTerm, yearFilter]);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (searchTerm) params.set('search', searchTerm);

        const data = await apiRequest<{ years: string[] }>(`/public-papers/years?${params.toString()}`, {
          auth: true,
        });
        setYears(data.years);
      } catch {
        setYears([]);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  const handleDownload = async (paper: PublicPaper) => {
    try {
      const data = await apiRequest<{ downloadUrl: string }>(`/public-papers/${paper._id}/download`, {
        method: 'POST',
        auth: true,
      });
      window.open(resolveFileUrl(data.downloadUrl), '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download PDF');
    }
  };

  const renderStars = (rating: number, ratingCount: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={16}
            className={star <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
          />
        ))}
        <span className="text-muted-foreground ml-1">
          {rating > 0 ? `${rating.toFixed(1)} (${ratingCount})` : 'No ratings'}
        </span>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-surface-workspace bg-fixed">
      <Sidebar role="user" />

      <div className="min-w-0 flex-1">
        <AppHeader role="user" />
        <div className="p-8">
          <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-foreground mb-2">Search Papers</h1>
            <p className="text-muted-foreground">Browse and download research papers available in the system</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
              {error}
            </div>
          )}

          <div className="bg-white rounded-lg border border-border shadow-sm p-6 mb-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by title, author, DOI, or keyword..."
                  maxLength={128}
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="pl-10 pr-8 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background appearance-none"
                >
                  <option value="all">All Years</option>
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mb-4 text-muted-foreground">
            {isLoading ? 'Loading papers...' : `Found ${papers.length} paper${papers.length !== 1 ? 's' : ''}`}
          </div>

          <div className="space-y-4">
            {papers.map((paper) => (
              <div
                key={paper._id}
                className="bg-white rounded-lg border border-border shadow-sm p-6 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-foreground mb-2">{paper.title}</h3>
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <span>{getPaperAuthors(paper)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground mb-2">
                      <span className="flex items-center gap-1">
                        <Calendar size={16} />
                        {paper.publishedYear}
                      </span>
                      <span>{getPaperType(paper)}</span>
                      <span className="flex items-center gap-1">
                        <Download size={16} />
                        {paper.downloadCount} downloads
                      </span>
                    </div>
                    <div className="mb-3">
                      {renderStars(paper.averageRating, paper.totalRatings)}
                    </div>
                    <div className="mb-3">
                      <ExpandableText text={paper.abstract} lines={4} />
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {paper.keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="px-2 py-1 bg-accent text-accent-foreground rounded border border-border"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                    <p className="text-muted-foreground">DOI: {paper.doi}</p>
                  </div>
                  <div className="flex flex-col gap-3 ml-4">
                    <button
                      onClick={() => navigate(`/paper/${paper._id}`)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 whitespace-nowrap"
                    >
                      <Eye size={18} />
                      View
                    </button>
                    {paper.pdfPath && paper.status === 'downloaded' ? (
                      <button
                        onClick={() => handleDownload(paper)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                      >
                        <Download size={18} />
                        Download
                      </button>
                    ) : (
                      <span className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-center whitespace-nowrap">
                        No PDF yet
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!isLoading && papers.length === 0 && (
            <div className="bg-white rounded-lg border border-border shadow-sm p-12 text-center">
              <Search size={48} className="mx-auto text-muted-foreground mb-4" />
              <h3 className="text-foreground mb-2">No papers found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search terms or filters.
              </p>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
