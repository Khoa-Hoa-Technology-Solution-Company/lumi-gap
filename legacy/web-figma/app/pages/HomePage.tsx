import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, BookOpen, Eye, FileText } from 'lucide-react';
import { Footer } from '../components/Footer';
import { HomeLandingSections } from '../components/HomeLandingSections';
import { PublicHeader } from '../components/PublicHeader';
import { apiRequest, getStoredUser } from '../lib/api';
import { getPaperAuthors, PublicPaper } from '../lib/papers';

const topics = [
  'Open Science',
  'Peer Review',
  'Preprints',
  'DOI',
  'Citations',
  'Methodology',
  'Reproducibility',
  'Meta-analysis',
  'Bibliography',
  'Tri thức mở',
];

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#9a9086]">
      <span className="text-[#7d746a]">§</span> {children}
    </p>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const [papers, setPapers] = useState<PublicPaper[]>([]);
  const [totalPapers, setTotalPapers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    apiRequest<{ papers: PublicPaper[]; pagination?: { total?: number } }>('/public-papers?sortBy=newest&page=1&limit=4')
      .then((data) => {
        if (!isMounted) return;
        setPapers(data.papers);
        setTotalPapers(data.pagination?.total ?? data.papers.length);
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : 'Không thể tải danh sách bài báo');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const openProtectedPath = (path: string) => navigate(currentUser ? path : '/login');
  const openPaper = (paperId: string) => navigate(currentUser ? `/paper/${paperId}` : '/login');

  const metrics = [
    { value: totalPapers.toLocaleString(), label: 'tài liệu công khai' },
    { value: '24/7', label: 'khả dụng mọi lúc' },
    { value: '100%', label: 'bài đăng được duyệt' },
    { value: 'Mở', label: 'cho cộng đồng' },
  ];

  return (
    <div className="min-h-screen bg-[#f8f6f2] text-[#1f1a17]">
      <PublicHeader />

      <main>
        <section className="border-b border-[#e5e0d8]">
          <div className="mx-auto max-w-7xl px-5 py-5 md:px-6 lg:px-8">
            <div className="flex flex-col gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-[#9a9086] sm:flex-row sm:items-center sm:justify-between">
              <span>Vol. 01 · Issue 06</span>
              <span>Established 2026 · Hanoi · Worldwide Open Access Library</span>
            </div>

            <div className="grid gap-10 py-16 md:grid-cols-[230px_minmax(0,1fr)_250px] md:items-end md:py-24">
              <div className="hidden text-xs leading-6 text-[#7d746a] md:block">
                <p className="font-semibold uppercase tracking-[0.22em] text-[#9a9086]">Số đặc biệt</p>
                <p className="mt-4">Mùa hè 2026</p>
                <p className="mt-5">Thư viện sống của cộng đồng nghiên cứu.</p>
                <p>Mỗi bài báo là một đóng góp công khai, miễn phí, vĩnh viễn.</p>
              </div>

              <div>
                <SectionLabel>Tri thức mở</SectionLabel>
                <h1 className="mt-5 max-w-3xl text-6xl font-black leading-[0.9] tracking-[-0.075em] text-[#1f1a17] sm:text-7xl lg:text-[106px]">
                  Tri thức
                  <span className="block font-serif font-normal italic tracking-[-0.08em] text-[#a49b91]">mở cho</span>
                  mọi người.
                </h1>
              </div>

              <div className="pb-1">
                <p className="text-sm leading-7 text-[#625a52]">
                  Một dự án phi lợi nhuận lưu trữ và chia sẻ bài báo học thuật do cộng đồng người Việt cùng đóng góp.
                </p>
                <div className="mt-6 space-y-3">
                  <button
                    type="button"
                    onClick={() => openProtectedPath('/request-paper')}
                    className="flex w-full items-center justify-between rounded-full bg-[#1f1a17] px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-white transition-opacity hover:opacity-80"
                  >
                    Yêu cầu bài báo
                    <ArrowRight size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openProtectedPath('/request-paper?mode=contribute')}
                    className="flex w-full items-center justify-between rounded-full border border-[#d8d0c4] bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#1f1a17] transition-colors hover:bg-[#f0ebe3]"
                  >
                    Đóng góp PDF
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid border-t border-[#e5e0d8] sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((metric, index) => (
                <div
                  key={metric.label}
                  className={`py-5 sm:px-5 ${index > 0 ? 'border-t border-[#e5e0d8] sm:border-l sm:border-t-0' : ''}`}
                >
                  <p className="text-2xl font-bold tracking-tight text-[#1f1a17]">{metric.value}</p>
                  <p className="mt-1 text-xs text-[#7d746a]">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden border-b border-[#e5e0d8] bg-white">
          <div className="topic-marquee flex min-w-max py-4">
            {[0, 1].map((groupIndex) => (
              <div
                key={groupIndex}
                aria-hidden={groupIndex === 1}
                className="flex shrink-0 items-center gap-7 pr-7"
              >
                {topics.map((topic, index) => (
                  <span key={topic} className="flex shrink-0 items-center gap-7">
                    <span
                      className={`text-xs uppercase tracking-[0.12em] ${
                        index % 3 === 1
                          ? 'font-serif text-sm font-normal italic text-[#aaa29a]'
                          : 'font-bold text-[#37322e]'
                      }`}
                    >
                      {topic}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#b8afa6]" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="border-b border-[#e5e0d8] bg-[#f8f6f2]">
          <div className="mx-auto max-w-7xl px-5 py-14 md:px-6 md:py-16 lg:px-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <SectionLabel>01 - Mục lục</SectionLabel>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                  Bài báo <span className="font-serif font-normal italic text-[#9a9086]">mới nhất</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('/explore')}
                className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1f1a17] transition-opacity hover:opacity-60"
              >
                Xem tất cả →
              </button>
            </div>

            <div className="mt-8 border-t border-[#d8d0c4]">
              {isLoading && <p className="py-8 text-sm text-[#7d746a]">Đang tải bài báo...</p>}
              {error && <p className="py-8 text-sm text-[#a64f46]">{error}</p>}
              {!isLoading && !error && papers.length === 0 && (
                <div className="border-b border-[#e5e0d8] py-12 text-center">
                  <BookOpen size={30} className="mx-auto text-[#b8afa6]" />
                  <p className="mt-4 text-sm text-[#7d746a]">Chưa có bài báo công khai.</p>
                </div>
              )}
              {!isLoading &&
                papers.map((paper, index) => (
                  <button
                    key={paper._id}
                    type="button"
                    onClick={() => openPaper(paper._id)}
                    className="group grid w-full gap-4 border-b border-[#e5e0d8] py-5 text-left transition-colors hover:bg-white md:grid-cols-[42px_minmax(0,1fr)_180px_80px] md:items-center md:px-3"
                  >
                    <span className="text-sm font-medium text-[#b8afa6]">{String(index + 1).padStart(2, '0')}</span>
                    <span>
                      <span className="block text-base font-semibold text-[#1f1a17] transition-colors group-hover:text-[#6f5438]">
                        {paper.title}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[#7d746a]">{getPaperAuthors(paper)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-[#7d746a]">
                      <FileText size={14} />
                      {paper.paperType} · {paper.publishedYear}
                    </span>
                    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7d746a]">
                      <Eye size={14} />
                      Xem
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </section>

        <HomeLandingSections />
      </main>

      <Footer />
    </div>
  );
}
