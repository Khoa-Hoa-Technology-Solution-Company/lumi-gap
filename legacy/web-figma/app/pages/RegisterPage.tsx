import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Building2, Lock, Mail, User } from 'lucide-react';
import { apiRequest, AuthUser, getStoredUser, getToken } from '../lib/api';
import { useToast } from '../components/ToastProvider';
import { PasswordStrengthChecklist } from '../components/PasswordStrengthChecklist';
import { UNIVERSITY_LIST_VN } from '../lib/universities';
import { normalizeText, validateFullName } from '../lib/validation';
import { getPasswordStrengthError } from '../lib/passwordStrength';
import { translateAuthMessage } from '../lib/authMessages';

export function RegisterPage() {
  const logo = new URL('../../imports/liemresearch-logo.png', import.meta.url).href;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    fullName: '',
    university: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUniversityOpen, setIsUniversityOpen] = useState(false);

  const filteredUniversities = UNIVERSITY_LIST_VN.filter((university) =>
    university.toLowerCase().includes(formData.university.trim().toLowerCase())
  ).slice(0, 8);

  // Redirect users who already have an active session.
  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();

    if (token && user) {
      navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleUniversitySelect = (university: string) => {
    setFormData({
      ...formData,
      university,
    });
    setIsUniversityOpen(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const fullNameError = validateFullName(formData.fullName);
    if (fullNameError) {
      setError(translateAuthMessage(fullNameError));
      return;
    }

    const universityError = validateUniversity(formData.university);
    if (universityError) {
      setError(universityError);
      return;
    }

    // studentId removed from registration
    if (!isValidEmail(formData.email)) {
      setError('Vui lòng nhập email hợp lệ.');
      return;
    }

    const passwordError = getPasswordStrengthError(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest<{ user: AuthUser; token: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      showToast('Tạo tài khoản thành công. Vui lòng đăng nhập.', 'success');

      navigate('/login', { state: { registered: true, email: formData.email } });
    } catch (err) {
      setError(translateAuthMessage(err instanceof Error ? err.message : 'Đăng ký thất bại.'));
    } finally {
      setIsLoading(false);
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
        <section className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <img src={logo} alt="LiemResearch" className="mx-auto mb-4 h-14 w-auto" />
            <h1 className="mb-2 text-2xl font-semibold text-foreground md:text-3xl">Tham gia LiemResearch</h1>
            <p className="text-sm leading-6 text-muted-foreground">Tạo tài khoản để yêu cầu bài báo, chia sẻ PDF và theo dõi đóng góp của bạn.</p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <TextInput
                label="Họ và tên"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                icon={User}
                placeholder="Nguyễn Văn A"
                autoComplete="name"
              />
              <UniversitySearchInput
                label="Trường đại học"
                value={formData.university}
                onChange={(value) => {
                  setFormData({ ...formData, university: value });
                  setIsUniversityOpen(true);
                  setError('');
                }}
                onSelect={handleUniversitySelect}
                onFocus={() => setIsUniversityOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setIsUniversityOpen(false), 150);
                }}
                isOpen={isUniversityOpen}
                suggestions={filteredUniversities}
                icon={Building2}
                placeholder="Tìm và chọn trường đại học"
              />
              <TextInput
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                icon={Mail}
                placeholder="student@university.edu"
                autoComplete="email"
              />
              <TextInput
                label="Mật khẩu"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                icon={Lock}
                placeholder="Ít nhất 8 ký tự"
                autoComplete="new-password"
              />
              <PasswordStrengthChecklist password={formData.password} />
              <TextInput
                label="Xác nhận mật khẩu"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                icon={Lock}
                placeholder="Nhập lại mật khẩu"
                autoComplete="new-password"
              />

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
              </button>
            </form>

            <div className="mt-6 border-t border-border/70 pt-5 text-center">
              <p className="text-sm text-muted-foreground">
                Đã có tài khoản?{' '}
                <button
                  onClick={() => navigate('/login')}
                  className="font-semibold text-primary hover:underline"
                >
                  Đăng nhập
                </button>
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function TextInput({
  label,
  name,
  value,
  onChange,
  icon: Icon,
  placeholder,
  type = 'text',
  autoComplete,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  icon: typeof User;
  placeholder: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-foreground">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          className="w-full rounded-lg border border-border bg-[color:var(--input-background)] py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
        />
      </div>
    </div>
  );
}

function UniversitySearchInput({
  label,
  value,
  onChange,
  onSelect,
  onFocus,
  onBlur,
  isOpen,
  suggestions,
  icon: Icon,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  isOpen: boolean;
  suggestions: string[];
  icon: typeof User;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <label className="mb-2 block text-foreground">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className="w-full rounded-lg border border-border bg-input-background py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder={placeholder}
          autoComplete="off"
          required
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="mt-2 max-h-56 w-full overflow-auto rounded-2xl border border-border/80 bg-white/95 shadow-[0_20px_60px_rgba(31,29,26,0.12)] backdrop-blur">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              <Building2 size={16} className="text-muted-foreground" />
              <span className="truncate">{item}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function validateUniversity(value: string) {
  const university = normalizeText(value);
  if (!university) {
    return 'Vui lòng chọn trường đại học.';
  }

  const isMatch = UNIVERSITY_LIST_VN.some(
    (item) => normalizeText(item).toLowerCase() === university.toLowerCase()
  );

  if (!isMatch) {
    return 'Vui lòng chọn trường đại học trong danh sách.';
  }

  return '';
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
