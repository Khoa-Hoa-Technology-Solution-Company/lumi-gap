import { useNavigate } from 'react-router';
import { getStoredUser } from '../lib/api';

export function Footer() {
  const navigate = useNavigate();
  const currentUser = getStoredUser();

  const openProtectedPath = (path: string) => navigate(currentUser ? path : '/login');

  return (
    <footer className="bg-[#1a1614] text-white">
      <div className="mx-auto max-w-7xl px-5 py-12 md:px-6 md:py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[280px_1fr]">
          <div>
            <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 transition-opacity hover:opacity-70">
              <span className="h-3 w-3 rounded-full bg-[#b5aea6]" />
              <span className="text-sm font-bold tracking-wide text-white">LiemResearch</span>
            </button>
            <p className="mt-4 max-w-[240px] text-xs leading-6 text-[#8f8780]">
              Dự án phi lợi nhuận vì mục tiêu bình đẳng hóa quyền truy cập tri thức khoa học tại Việt Nam.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#5a544f]">Khám phá</p>
              <nav className="mt-4 space-y-3">
                <button type="button" onClick={() => navigate('/explore')} className="block text-sm text-[#8f8780] transition-colors hover:text-white">Bài báo</button>
                <button type="button" onClick={() => openProtectedPath('/request-paper')} className="block text-sm text-[#8f8780] transition-colors hover:text-white">Yêu cầu</button>
                <button type="button" onClick={() => navigate('/rankings')} className="block text-sm text-[#8f8780] transition-colors hover:text-white">Bảng xếp hạng</button>
              </nav>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#5a544f]">Tham gia</p>
              <nav className="mt-4 space-y-3">
                <button type="button" onClick={() => openProtectedPath('/request-paper?mode=contribute')} className="block text-sm text-[#8f8780] transition-colors hover:text-white">Đóng góp PDF</button>
                <button type="button" onClick={() => navigate('/login')} className="block text-sm text-[#8f8780] transition-colors hover:text-white">Đăng nhập</button>
                <button type="button" onClick={() => navigate(currentUser ? '/profile' : '/register')} className="block text-sm text-[#8f8780] transition-colors hover:text-white">Hồ sơ</button>
              </nav>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#5a544f]">Liên hệ</p>
              <div className="mt-4 space-y-3 text-sm text-[#8f8780]">
                <p>Hanoi · Vietnam</p>
                <p>Open Science Initiative</p>
                <p>MMXXVI</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-[10px] font-semibold uppercase tracking-[0.26em] text-[#5a544f] sm:flex-row sm:items-center">
          <span>© 2026 LiemResearch Community</span>
          <span>Designed for Open Science · Made in Vietnam</span>
        </div>
      </div>
    </footer>
  );
}
