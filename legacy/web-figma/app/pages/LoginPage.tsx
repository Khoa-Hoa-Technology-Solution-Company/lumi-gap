import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { apiRequest, AuthUser, saveAuth, getStoredUser, getToken } from '../lib/api';
import { useToast } from '../components/ToastProvider';
import { translateAuthMessage } from '../lib/authMessages';

export function LoginPage() {
  const { showToast } = useToast();
  const logo = new URL('../../imports/liemresearch-logo.png', import.meta.url).href;
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Redirect users who already have an active session.
  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();

    if (token && user) {
      navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (location.state?.registered) {
      showToast('Tạo tài khoản thành công. Vui lòng đăng nhập.', 'success');
      if (location.state.email) setEmail(location.state.email as string);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, showToast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setEmailError('Vui lòng nhập email.');
      return;
    }

    if (!isValidEmail(email)) {
      setEmailError('Vui lòng nhập email hợp lệ.');
      return;
    }

    if (!password.trim()) {
      showToast('Vui lòng nhập mật khẩu.', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const data = await apiRequest<{ user: AuthUser; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      saveAuth(data.token, data.user);

      navigate(data.user.role === 'admin' ? '/admin' : '/dashboard', {
        state: { loginSuccess: true },
        replace: true,
      });
    } catch (err) {
      showToast(translateAuthMessage(err instanceof Error ? err.message : 'Đăng nhập thất bại.'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (value.trim() && !isValidEmail(value)) {
      setEmailError('Email không đúng định dạng.');
    } else {
      setEmailError('');
    }
  };

  return (
    <div className="min-h-screen bg-surface-feed bg-fixed text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-3 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-3 text-left transition-opacity hover:opacity-80"
          >
            <img src={logo} alt="LiemResearch" className="h-9 w-auto lg:h-10" />
            <span className="text-base font-semibold tracking-tight text-foreground lg:text-lg">LiemResearch</span>
          </button>

        </div>
      </header>

      <main className="mx-auto flex max-w-7xl justify-center px-4 py-10 sm:px-5 lg:px-6">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <img src={logo} alt="LiemResearch" className="mx-auto mb-4 h-14 w-auto" />
            <h1 className="mb-2 text-2xl font-semibold text-foreground md:text-3xl">Chào mừng trở lại</h1>
            <p className="text-sm leading-6 text-muted-foreground">Đăng nhập để tiếp tục sử dụng LiemResearch.</p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-foreground mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    className={`w-full rounded-lg border bg-[color:var(--input-background)] py-3 pl-10 pr-4 transition-colors focus:outline-none focus:ring-2 ${
                      emailError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-border focus:ring-ring'
                    }`}
                    placeholder="student@university.edu"
                    required
                  />
                </div>
                {emailError && <p className="text-red-500 text-sm mt-1">{emailError}</p>}
              </div>

              <div>
                <label className="block text-foreground mb-2">Mật khẩu</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-border bg-[color:var(--input-background)] py-3 pl-10 pr-12 focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Nhập mật khẩu"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>
            </form>

            <div className="mt-6 border-t border-border/70 pt-5 text-center">
              <p className="text-sm text-muted-foreground">
                Chưa có tài khoản?{' '}
                <button
                  onClick={() => navigate('/register')}
                  className="font-semibold text-primary hover:underline"
                >
                  Tạo tài khoản
                </button>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
