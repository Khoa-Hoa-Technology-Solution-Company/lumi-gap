import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, ArrowUpRight, BadgeCheck, ChevronDown, Clock3, Mail, TrendingUp } from 'lucide-react';
import { apiRequest, AuthUser, getStoredUser } from '../lib/api';
import { PublicPaper } from '../lib/papers';

type RankingEntry = {
  rank: number;
  user: AuthUser;
  points: number;
  uploadedPapers: number;
  uploadedPdfs: number;
  ratingsGiven: number;
};

const processSteps = [
  {
    number: '01',
    title: 'GỬI YÊU CẦU',
    description: 'Dán DOI, link hoặc tên bài. Hệ thống kiểm tra trùng lặp và trích xuất metadata.',
  },
  {
    number: '02',
    title: 'CỘNG ĐỒNG HỖ TRỢ',
    description: 'Thành viên có quyền truy cập tải PDF lên. Mỗi đóng góp hợp lệ đều được ghi nhận.',
  },
  {
    number: '03',
    title: 'MỞ VĨNH VIỄN',
    description: 'Tài liệu được lưu trữ công khai, có thể tìm kiếm và tiếp tục phục vụ cộng đồng.',
  },
];

const featuredJournals = ['Nature', 'Science', 'The Lancet', 'Cell', 'PNAS', 'IEEE'];

const faqItems = [
  {
    question: 'LiemResearch có miễn phí không?',
    answer: 'Việc duyệt thư viện là miễn phí. Bạn cần đăng nhập để tải PDF, gửi yêu cầu và đóng góp tài liệu.',
  },
  {
    question: 'Làm sao để yêu cầu một bài báo?',
    answer: 'Sau khi đăng nhập, mở trang Yêu cầu và dán DOI, link hoặc tên bài. Hệ thống sẽ kiểm tra trùng lặp trước khi tạo yêu cầu.',
  },
  {
    question: 'PDF tải lên có được kiểm duyệt không?',
    answer: 'Có. Mọi đóng góp cần được xem xét để đảm bảo đúng tài liệu, đọc được và phù hợp với quy định của thư viện.',
  },
  {
    question: 'Điểm uy tín dùng để làm gì?',
    answer: 'Điểm phản ánh giá trị đóng góp của thành viên và giúp ghi nhận những người đang xây dựng thư viện tích cực nhất.',
  },
  {
    question: 'Tôi có thể đóng góp PDF trực tiếp không?',
    answer: 'Có. Chọn Đóng góp PDF, tìm yêu cầu phù hợp và tải tài liệu lên để admin kiểm duyệt.',
  },
] as const;

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#9a9086]">
      <span className="text-[#7d746a]">§</span> {children}
    </p>
  );
}

function SectionLink({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f1a17] transition-opacity hover:opacity-60"
    >
      {children}
    </button>
  );
}

function getContributorHighlight(entry: RankingEntry) {
  if (entry.uploadedPdfs > 0) {
    return `${entry.user.fullName} đã chia sẻ ${entry.uploadedPdfs} PDF và đang có ${entry.points.toLocaleString()} điểm uy tín.`;
  }

  if (entry.uploadedPapers > 0) {
    return `${entry.user.fullName} đã bổ sung ${entry.uploadedPapers} yêu cầu bài báo để giúp thư viện tiếp tục mở rộng.`;
  }

  return `${entry.user.fullName} đang đứng hạng ${entry.rank} với ${entry.points.toLocaleString()} điểm đóng góp.`;
}

export function HomeLandingSections() {
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const [pendingPapers, setPendingPapers] = useState<PublicPaper[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubmitted, setNewsletterSubmitted] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      apiRequest<{ papers: PublicPaper[] }>('/public-papers?hasPdf=false&limit=5&sortBy=newest'),
      apiRequest<{ rankings: RankingEntry[] }>('/rankings/top?page=1&limit=5'),
    ])
      .then(([papersData, rankingsData]) => {
        if (!isMounted) return;
        setPendingPapers(papersData.papers);
        setRankings(rankingsData.rankings);
      })
      .catch(() => {
        if (!isMounted) return;
        setPendingPapers([]);
        setRankings([]);
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

  const handleNewsletterSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (newsletterEmail.trim()) setNewsletterSubmitted(true);
  };

  return (
    <>
      <section className="bg-[#1a1614] text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-2 md:gap-16 md:px-6 md:py-20 lg:px-8 lg:py-24">
          <div>
            <SectionLabel>02 - Quy trình</SectionLabel>
            <h2 className="mt-4 text-5xl font-black leading-[0.92] tracking-[-0.06em] md:text-6xl">
              Ba bước.
              <span className="block font-serif font-normal italic text-[#8f8780]">Không hơn.</span>
            </h2>
          </div>

          <div className="grid gap-10 sm:grid-cols-3 sm:gap-6">
            {processSteps.map((step) => (
              <div key={step.number}>
                <p className="text-sm font-medium text-[#8f8780]">{step.number}</p>
                <h3 className="mt-3 text-xs font-bold tracking-[0.16em] text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#b5aea6]">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e5e0d8] bg-[#f5f3f0]">
        <div className="mx-auto grid max-w-7xl md:grid-cols-2">
          <div className="border-b border-[#e5e0d8] px-5 py-10 md:border-b-0 md:border-r md:px-8 md:py-12 lg:px-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>03 - Mở</SectionLabel>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Đang chờ hỗ trợ</h2>
              </div>
              <SectionLink onClick={() => openProtectedPath('/request-paper')}>+ Tạo mới</SectionLink>
            </div>
            <div className="mt-6 border-t border-[#e5e0d8]" />

            <div className="mt-6 min-h-[140px]">
              {isLoading && <p className="text-sm text-[#7d746a]">Đang tải...</p>}
              {!isLoading && pendingPapers.length === 0 && (
                <p className="text-sm text-[#7d746a]">Không có yêu cầu nào đang chờ.</p>
              )}
              {!isLoading && pendingPapers.length > 0 && (
                <ul className="space-y-4">
                  {pendingPapers.map((paper) => (
                    <li key={paper._id}>
                      <button type="button" onClick={() => openPaper(paper._id)} className="group w-full text-left">
                        <p className="font-medium text-[#1f1a17] transition-colors group-hover:text-[#6f5438]">{paper.title}</p>
                        <p className="mt-1 text-xs text-[#7d746a]">{paper.publishedYear}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="px-5 py-10 md:px-8 md:py-12 lg:px-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>04 - Vinh danh</SectionLabel>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Top đóng góp</h2>
              </div>
              <SectionLink onClick={() => navigate('/rankings')}>Đầy đủ →</SectionLink>
            </div>
            <div className="mt-6 border-t border-[#e5e0d8]" />

            <div className="mt-6 min-h-[140px]">
              {isLoading && <p className="text-sm text-[#7d746a]">Đang tải...</p>}
              {!isLoading && rankings.length === 0 && <p className="text-sm text-[#7d746a]">Chưa có ai đóng góp.</p>}
              {!isLoading && rankings.length > 0 && (
                <ul className="space-y-4">
                  {rankings.map((item) => (
                    <li key={item.user._id} className="flex items-baseline justify-between gap-4">
                      <div className="min-w-0 truncate">
                        <span className="mr-3 text-sm font-medium text-[#9a9086]">{String(item.rank).padStart(2, '0')}</span>
                        <span className="font-medium text-[#1f1a17]">{item.user.fullName}</span>
                      </div>
                      <span className="shrink-0 text-sm text-[#7d746a]">{item.points} điểm</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e5e0d8] bg-[#f5f3f0] pb-16 md:pb-20">
        <div className="mx-auto max-w-7xl px-5 md:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4 py-10 md:py-12">
            <div>
              <SectionLabel>05 - Lĩnh vực</SectionLabel>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Tạp chí <span className="font-serif font-normal italic text-[#9a9086]">nổi bật</span>
              </h2>
            </div>
            <SectionLink onClick={() => navigate('/explore')}>Xem tất cả →</SectionLink>
          </div>

          <div className="grid border-t border-[#e5e0d8] sm:grid-cols-3">
            {featuredJournals.map((journal, index) => (
              <div
                key={journal}
                className={`flex min-h-[140px] flex-col justify-between border-b border-[#e5e0d8] p-6 md:min-h-[160px] md:p-8 ${
                  (index + 1) % 3 !== 0 ? 'sm:border-r' : ''
                }`}
              >
                <div className="flex justify-between text-sm font-medium text-[#9a9086]">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <ArrowUpRight size={18} className="text-[#c4bbb0]" />
                </div>
                <div>
                  <p className="text-xl font-bold text-[#1f1a17] md:text-2xl">{journal}</p>
                  <p className="mt-2 text-sm text-[#7d746a]">Đang cập nhật</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e5e0d8] bg-[#f1efeb] py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-5 text-center md:px-6">
          <blockquote>
            <p className="text-3xl font-semibold leading-tight tracking-tight text-[#1f1a17] md:text-4xl">
              “Tri thức không nên bị giới hạn bởi{' '}
              <span className="font-serif font-normal italic text-[#9a9086]">paywall</span>. Nó thuộc về{' '}
              <span className="font-serif font-normal italic text-[#9a9086]">nhân loại</span>.”
            </p>
          </blockquote>
          <p className="mx-auto mt-10 max-w-xs border-t border-[#d8d0c4] pt-6 text-xs font-semibold uppercase tracking-[0.28em] text-[#9a9086]">
            Sứ mệnh LiemResearch
          </p>
        </div>
      </section>

      <section className="border-t border-[#e5e0d8] bg-[#f5f3f0] py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-5 md:px-6 lg:px-8">
          <SectionLabel>06 - Cộng đồng</SectionLabel>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-[#1f1a17] md:text-5xl">
            Tiếng nói <span className="font-serif font-normal italic text-[#9a9086]">thành viên</span>
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {isLoading && <p className="text-sm text-[#7d746a] md:col-span-3">Đang tải thành viên nổi bật...</p>}
            {!isLoading && rankings.length === 0 && (
              <p className="text-sm text-[#7d746a] md:col-span-3">Những đóng góp đầu tiên sẽ xuất hiện tại đây.</p>
            )}
            {!isLoading &&
              rankings.slice(0, 3).map((entry) => (
                <article key={entry.user._id} className="flex flex-col border border-[#e5e0d8] bg-white p-6 md:p-7">
                  <div className="flex justify-between">
                    <span className="font-serif text-3xl text-[#d8d0c4]">“</span>
                    <span className="text-2xl font-medium text-[#e5e0d8]">{String(entry.rank).padStart(2, '0')}</span>
                  </div>
                  <p className="mt-5 flex-1 text-sm leading-7 text-[#4a433c]">{getContributorHighlight(entry)}</p>
                  <div className="mt-8 border-t border-[#f0ebe3] pt-5">
                    <p className="font-semibold text-[#1f1a17]">{entry.user.fullName}</p>
                    <p className="mt-1 text-xs text-[#7d746a]">{entry.user.university || 'Thành viên LiemResearch'}</p>
                    <span className="mt-4 inline-block rounded-full border border-[#e5e0d8] bg-[#faf8f5] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7d746a]">
                      Hạng {entry.rank} · {entry.points} điểm
                    </span>
                  </div>
                </article>
              ))}
          </div>
        </div>
      </section>

      <section className="bg-[#1a1614] text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-2 md:gap-16 md:px-6 md:py-20 lg:px-8 lg:py-24">
          <div>
            <SectionLabel>07 - Phát triển</SectionLabel>
            <h2 className="mt-4 text-5xl font-black leading-[0.92] tracking-[-0.06em] md:text-6xl">
              Đang
              <span className="block font-serif font-normal italic text-[#8f8780]">tăng trưởng.</span>
            </h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-[#b5aea6]">
              Số lượng tài liệu được đóng góp tăng dần theo thời gian. Càng nhiều thành viên tham gia, thư viện càng hữu ích.
            </p>
          </div>

          <div className="grid content-end gap-4 sm:grid-cols-3">
            <div className="border border-white/10 bg-white/5 p-5">
              <TrendingUp size={18} className="text-[#b5aea6]" />
              <p className="mt-5 text-3xl font-semibold">+340%</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#8f8780]">Tăng trưởng</p>
            </div>
            <div className="border border-white/10 bg-white/5 p-5">
              <Clock3 size={18} className="text-[#b5aea6]" />
              <p className="mt-5 text-3xl font-semibold">24/7</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#8f8780]">Hoạt động</p>
            </div>
            <div className="border border-white/10 bg-white/5 p-5">
              <BadgeCheck size={18} className="text-[#b5aea6]" />
              <p className="mt-5 text-3xl font-semibold">100%</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#8f8780]">Bài duyệt</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e5e0d8] bg-[#f5f3f0] py-16 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 md:grid-cols-[340px_minmax(0,1fr)] md:gap-16 md:px-6 lg:px-8">
          <div>
            <SectionLabel>08 - Hỏi đáp</SectionLabel>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-[#1f1a17] md:text-5xl">
              Những câu hỏi
              <span className="block font-serif font-normal italic text-[#9a9086]">thường gặp</span>
            </h2>
          </div>

          <div className="border-t border-[#e5e0d8]">
            {faqItems.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div key={item.question} className="border-b border-[#e5e0d8]">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-semibold text-[#1f1a17] md:text-base">{item.question}</span>
                    <ChevronDown size={18} className={`shrink-0 text-[#9a9086] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && <p className="pb-6 pr-10 text-sm leading-7 text-[#4a433c]">{item.answer}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e5e0d8] bg-[#f5f3f0]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:grid-cols-2 md:items-center md:px-6 lg:px-8">
          <div>
            <SectionLabel>09 - Cập nhật</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              Nhận thông báo <span className="font-serif font-normal italic text-[#9a9086]">bài mới</span>
            </h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-[#7d746a]">
              Theo dõi bài mới, yêu cầu đang mở và những cập nhật đáng chú ý từ cộng đồng.
            </p>
          </div>

          {newsletterSubmitted ? (
            <div className="border border-[#d8d0c4] bg-white px-5 py-4 text-sm text-[#1f1a17]">Email của bạn đã được ghi nhận.</div>
          ) : (
            <form onSubmit={handleNewsletterSubmit}>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9a9086]" />
                  <input
                    type="email"
                    required
                    value={newsletterEmail}
                    onChange={(event) => setNewsletterEmail(event.target.value)}
                    placeholder="Email của bạn"
                    className="w-full rounded-full border border-[#d8d0c4] bg-white py-3 pl-11 pr-4 text-sm outline-none"
                  />
                </div>
                <button type="submit" className="rounded-full bg-[#1f1a17] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                  Đăng ký
                </button>
              </div>
              <p className="mt-3 pl-3 text-xs text-[#9a9086]">Không spam. Hủy bất cứ lúc nào.</p>
            </form>
          )}
        </div>
      </section>

      <section className="border-t border-[#e5e0d8] bg-[#f5f3f0] py-20 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 md:grid-cols-2 md:items-end md:px-6 lg:px-8">
          <h2 className="text-6xl font-black leading-[0.88] tracking-[-0.08em] text-[#1f1a17] md:text-7xl lg:text-[92px]">
            Bắt đầu
            <span className="block font-serif font-normal italic text-[#c9c0b5]">đóng góp</span>
            hôm nay.
          </h2>

          <div className="space-y-3 md:ml-auto md:w-72">
            <button
              type="button"
              onClick={() => navigate(currentUser ? '/request-paper' : '/register')}
              className="flex w-full items-center justify-between rounded-full bg-[#1f1a17] px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-white"
            >
              Tham gia
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => navigate('/explore')}
              className="flex w-full items-center justify-between rounded-full border border-[#d8d0c4] bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#1f1a17]"
            >
              Khám phá
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
