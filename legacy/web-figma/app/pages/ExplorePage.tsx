import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { Footer } from '../components/Footer';
import { PaperCard } from '../components/PaperCard';
import { PublicHeader } from '../components/PublicHeader';
import { apiRequest, getStoredUser } from '../lib/api';
import { PublicPaper } from '../lib/papers';

type SortOption = 'newest' | 'rating' | 'downloads';

const sortOptions: Array<{ value: SortOption; label: string }> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'rating', label: 'Đánh giá cao' },
  { value: 'downloads', label: 'Tải nhiều nhất' },
];

export function ExplorePage() {
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const [papers, setPapers] = useState<PublicPaper[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sortBy]);

  useEffect(() => {
    let isMounted = true;

    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams({
        sortBy,
        page: String(page),
        limit: '8',
      });
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      setIsLoading(true);
      setError('');

      apiRequest<{ papers: PublicPaper[]; pagination?: { page?: number; total?: number; totalPages?: number } }>(
        `/public-papers?${params.toString()}`
      )
        .then((data) => {
          if (!isMounted) return;
          setPapers(data.papers);
          setPage(data.pagination?.page ?? page);
          setTotal(data.pagination?.total ?? data.papers.length);
          setTotalPages(data.pagination?.totalPages ?? 1);
        })
        .catch((err) => {
          if (isMounted) setError(err instanceof Error ? err.message : 'Không thể tải thư viện');
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    }, 220);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [page, searchTerm, sortBy]);

  const openPaper = (paperId: string) => navigate(currentUser ? `/paper/${paperId}` : '/login');

  return (
    <div className="min-h-screen bg-[#f8f6f2] text-[#1f1a17]">
      <PublicHeader />

      <main>
        <section className="border-b border-[#e5e0d8]">
          <div className="mx-auto max-w-7xl px-5 py-14 md:px-6 md:py-20 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#9a9086]">§ Thư viện mở</p>
            <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-end">
              <h1 className="max-w-4xl text-6xl font-black leading-[0.9] tracking-[-0.075em] md:text-7xl">
                Khám phá
                <span className="block font-serif font-normal italic text-[#a49b91]">tri thức mở.</span>
              </h1>
              <p className="text-sm leading-7 text-[#625a52]">
                Tìm theo tiêu đề, DOI hoặc từ khóa. Có {total.toLocaleString()} tài liệu đang được chia sẻ trong thư viện.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-[#e5e0d8] bg-white">
          <div className="mx-auto grid max-w-7xl gap-3 px-5 py-5 md:grid-cols-[minmax(0,1fr)_220px] md:px-6 lg:px-8">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9a9086]" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Tìm theo tiêu đề, DOI hoặc từ khóa..."
                maxLength={128}
                className="w-full rounded-full border border-[#d8d0c4] bg-[#f8f6f2] py-3 pl-11 pr-4 text-sm outline-none focus:border-[#9a9086]"
              />
            </div>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="rounded-full border border-[#d8d0c4] bg-[#f8f6f2] px-4 py-3 text-sm outline-none focus:border-[#9a9086]"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-10 md:px-6 md:py-14">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a9086]">
              {isLoading ? 'Đang tải...' : `${total.toLocaleString()} tài liệu`}
            </p>
            {!currentUser && <p className="text-xs text-[#7d746a]">Đăng nhập để mở chi tiết và tải PDF.</p>}
          </div>

          {error && <div className="mb-5 border border-[#efc8c8] bg-[#fff3f3] p-4 text-sm text-[#9d3d3d]">{error}</div>}

          <div className="space-y-4">
            {!isLoading &&
              papers.map((paper) => (
                <PaperCard
                  key={paper._id}
                  paper={paper}
                  onOpen={(selectedPaper) => openPaper(selectedPaper._id)}
                  onTagClick={(keyword) => setSearchTerm(keyword)}
                />
              ))}
          </div>

          {!isLoading && papers.length === 0 && !error && (
            <div className="border border-[#e5e0d8] bg-white p-10 text-center">
              <Search size={34} className="mx-auto text-[#b8afa6]" />
              <p className="mt-4 text-sm text-[#7d746a]">Không tìm thấy tài liệu phù hợp.</p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between border-t border-[#d8d0c4] pt-5">
              <p className="text-sm text-[#7d746a]">
                Trang {page} / {totalPages}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={page === 1 || isLoading}
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                  className="rounded-full border border-[#d8d0c4] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] disabled:opacity-40"
                >
                  Trước
                </button>
                <button
                  type="button"
                  disabled={page === totalPages || isLoading}
                  onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                  className="rounded-full bg-[#1f1a17] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-40"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
