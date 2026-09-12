import { useEffect, useState } from 'react';
import { Award, FileText, Medal, Star, Trophy, Upload } from 'lucide-react';
import { Footer } from '../components/Footer';
import { PublicHeader } from '../components/PublicHeader';
import { apiRequest, AuthUser } from '../lib/api';

type RankingEntry = {
  rank: number;
  user: AuthUser;
  points: number;
  uploadedPapers: number;
  uploadedPdfs: number;
  ratingsGiven: number;
};

function RankMark({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy size={22} className="text-[#9b711d]" />;
  if (rank === 2) return <Medal size={22} className="text-[#80756a]" />;
  if (rank === 3) return <Award size={22} className="text-[#a66d43]" />;
  return <span className="text-sm font-semibold text-[#9a9086]">{String(rank).padStart(2, '0')}</span>;
}

export function PublicRankingsPage() {
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setError('');

    apiRequest<{ rankings: RankingEntry[]; pagination?: { page?: number; total?: number; totalPages?: number } }>(
      `/rankings/top?page=${page}&limit=10`
    )
      .then((data) => {
        if (!isMounted) return;
        setRankings(data.rankings);
        setPage(data.pagination?.page ?? page);
        setTotal(data.pagination?.total ?? data.rankings.length);
        setTotalPages(data.pagination?.totalPages ?? 1);
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : 'Không thể tải bảng xếp hạng');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [page]);

  return (
    <div className="min-h-screen bg-[#f8f6f2] text-[#1f1a17]">
      <PublicHeader />

      <main>
        <section className="border-b border-[#e5e0d8]">
          <div className="mx-auto max-w-7xl px-5 py-14 md:px-6 md:py-20 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#9a9086]">§ Vinh danh cộng đồng</p>
            <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-end">
              <h1 className="max-w-4xl text-6xl font-black leading-[0.9] tracking-[-0.075em] md:text-7xl">
                Những người
                <span className="block font-serif font-normal italic text-[#a49b91]">đang góp sức.</span>
              </h1>
              <p className="text-sm leading-7 text-[#625a52]">
                Bảng xếp hạng ghi nhận {total.toLocaleString()} thành viên qua tài liệu, PDF và đánh giá hữu ích.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-10 md:px-6 md:py-14">
          {error && <div className="mb-5 border border-[#efc8c8] bg-[#fff3f3] p-4 text-sm text-[#9d3d3d]">{error}</div>}
          {isLoading && <p className="py-10 text-sm text-[#7d746a]">Đang tải bảng xếp hạng...</p>}

          {!isLoading && rankings.length > 0 && (
            <div className="border-t border-[#d8d0c4]">
              {rankings.map((item) => (
                <article
                  key={item.user._id}
                  className="grid gap-4 border-b border-[#e5e0d8] py-6 md:grid-cols-[70px_minmax(0,1fr)_280px_120px] md:items-center"
                >
                  <div className="flex items-center gap-3">
                    <RankMark rank={item.rank} />
                    <span className="text-sm font-semibold text-[#7d746a]">#{item.rank}</span>
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold">{item.user.fullName}</h2>
                    <p className="mt-1 text-sm text-[#7d746a]">{item.user.university || 'Thành viên LiemResearch'}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm text-[#7d746a]">
                    <span className="flex items-center gap-1.5"><FileText size={15} /> {item.uploadedPapers} bài</span>
                    <span className="flex items-center gap-1.5"><Upload size={15} /> {item.uploadedPdfs} PDF</span>
                    <span className="flex items-center gap-1.5"><Star size={15} /> {item.ratingsGiven} đánh giá</span>
                  </div>

                  <p className="text-left text-2xl font-bold md:text-right">{item.points.toLocaleString()} <span className="text-xs font-medium text-[#9a9086]">điểm</span></p>
                </article>
              ))}
            </div>
          )}

          {!isLoading && rankings.length === 0 && !error && (
            <div className="border border-[#e5e0d8] bg-white p-10 text-center">
              <Trophy size={34} className="mx-auto text-[#b8afa6]" />
              <p className="mt-4 text-sm text-[#7d746a]">Chưa có dữ liệu xếp hạng.</p>
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
