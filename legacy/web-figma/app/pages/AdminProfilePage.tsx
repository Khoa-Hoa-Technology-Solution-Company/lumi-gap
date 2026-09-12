import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { Sidebar } from '../components/Sidebar';
import { AppHeader } from '../components/AppHeader';
import { LoadingSkeleton } from '../components/LoadingSpinner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PasswordStrengthChecklist } from '../components/PasswordStrengthChecklist';
import {
  Building2,
  Calendar,
  CreditCard,
  Edit,
  Eye,
  EyeOff,
  FileText,
  CheckCircle2,
  Upload,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { apiRequest, AuthUser, clearAuth, getStoredUser, getToken, saveAuth } from '../lib/api';
import { formatDisplayDate } from '../lib/date';
import { validateFullName, validateUniversityName } from '../lib/validation';
import { getPasswordStrengthError } from '../lib/passwordStrength';

type ProfileForm = {
  fullName: string;
  email: string;
  university: string;
  memberSince: string;
  credits: number;
};

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type ProfileTab = 'overview' | 'activity' | 'settings';

type ActivityItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
};

type PaperRequest = {
  _id: string;
  title?: string;
  status: 'pending' | 'approved' | 'rejected' | 'downloaded' | 'not-downloaded' | 'pending-requester-acceptance';
  pdfPath?: string;
  createdAt?: string;
  updatedAt?: string;
  uploadedAt?: string;
};

function mapUserToProfile(user: AuthUser): ProfileForm {
  return {
    fullName: user.fullName,
    email: user.email,
    university: user.university,
    memberSince: user.createdAt ? formatDisplayDate(user.createdAt) : '',
    credits: user.credits ?? 0,
  };
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function AdminProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const storedUser = getStoredUser();
  const initialProfile = storedUser
    ? mapUserToProfile(storedUser)
    : { fullName: '', email: '', university: '', memberSince: '', credits: 0 };
  const [profile, setProfile] = useState<ProfileForm>(initialProfile);
  const [editForm, setEditForm] = useState<ProfileForm>(initialProfile);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [myPapers, setMyPapers] = useState<PaperRequest[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        const [meData, paperData] = await Promise.all([
          apiRequest<{ user: AuthUser }>('/auth/me', { auth: true }),
          apiRequest<{ papers: PaperRequest[] }>('/papers/my-requests', { auth: true }).catch(() => ({ papers: [] })),
        ]);
        const data = meData;
        const nextProfile = mapUserToProfile(data.user);

        if (isMounted) {
          setProfile(nextProfile);
          setEditForm(nextProfile);
          setMyPapers(paperData.papers ?? []);
          const token = getToken();
          if (token) saveAuth(token, data.user);
          setError('');
        }
      } catch (err) {
        clearAuth();
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load profile');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const initials = useMemo(() => getInitials(profile.fullName) || 'A', [profile.fullName]);
  const approvedPapers = myPapers.filter((paper) =>
    ['approved', 'downloaded', 'not-downloaded', 'pending-requester-acceptance'].includes(paper.status)
  ).length;
  const pdfReadyPapers = myPapers.filter((paper) => paper.status === 'downloaded' && Boolean(paper.pdfPath)).length;
  const activityItems = useMemo(() => buildRecentActivity(myPapers), [myPapers]);

  const handleSave = async () => {
    setError('');
    setMessage('');

    const fullNameError = validateFullName(editForm.fullName);
    if (fullNameError) {
      setError(fullNameError);
      return;
    }

    const universityError = validateUniversityName(editForm.university);
    if (universityError) {
      setError(universityError);
      return;
    }

    setIsSaving(true);

    try {
      const data = await apiRequest<{ user: AuthUser }>('/auth/me', {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({
          fullName: editForm.fullName,
          university: editForm.university,
        }),
      });
      const token = getToken();
      const nextProfile = mapUserToProfile(data.user);

      if (token) saveAuth(token, data.user);

      setProfile(nextProfile);
      setEditForm(nextProfile);
      setIsEditing(false);
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditForm(profile);
    setIsEditing(false);
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setError('Please fill in all password fields.');
      return;
    }

    const passwordError = getPasswordStrengthError(passwordForm.newPassword, 'New password');
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setError('New password must be different from current password.');
      return;
    }

    setIsChangingPassword(true);

    try {
      const data = await apiRequest<{ message: string; token: string }>('/auth/change-password', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(passwordForm),
      });
      const currentUser = getStoredUser();

      if (currentUser) saveAuth(data.token, currentUser);

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Password changed successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    setError('');

    try {
      await apiRequest('/auth/me', {
        method: 'DELETE',
        auth: true,
        body: JSON.stringify({ password: deletePassword }),
      });

      clearAuth();
      window.location.href = '/login';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete account');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-surface-achievement bg-fixed">
      <Sidebar role="admin" />

      <div className="min-w-0 flex-1">
        <AppHeader role="admin" />
        <div className="p-8">
          <div className="mx-auto max-w-6xl">
            {isLoading && (
              <div className="mb-6">
                <LoadingSkeleton variant="profile" />
              </div>
            )}

            {error && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                {error}
              </div>
            )}

            {message && (
              <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
                {message}
              </div>
            )}

            {!isLoading && (
              <>
                <section className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
                  <div className="h-28 bg-slate-800" />
                  <div className="px-8 pb-8">
                    <div className="-mt-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <div className="flex h-28 w-28 items-center justify-center rounded-lg border-4 border-white bg-foreground text-4xl font-semibold text-white shadow-sm">
                          {initials}
                        </div>
                        <div className="pb-1">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                              <CreditCard size={15} />
                              {profile.credits} credits
                            </span>
                            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
                              Admin account
                            </span>
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                              Secure profile
                            </span>
                          </div>
                          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold text-foreground">
                            <span>{profile.fullName || 'Admin Profile'}</span>
                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-700">
                              <ShieldCheck size={16} />
                              Admin
                            </span>
                          </h1>
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <Building2 size={16} />
                              {profile.university || 'No university'}
                            </span>
                            <span className="flex items-center gap-2">
                              <Calendar size={16} />
                              Joined {profile.memberSince || 'recently'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-primary-foreground transition-colors hover:bg-blue-600"
                      >
                        <Edit size={18} />
                        Edit Profile
                      </button>
                    </div>

                    <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
                      <ProfileMetric label="Papers" value={myPapers.length} icon={FileText} />
                      <ProfileMetric label="Approved" value={approvedPapers} icon={CheckCircle2} />
                      <ProfileMetric label="PDFs" value={pdfReadyPapers} icon={Upload} />
                      <ProfileMetric label="Credits" value={profile.credits} icon={CreditCard} />
                    </div>
                  </div>
                </section>

                <div className="mt-6 rounded-lg border border-border bg-white shadow-sm">
                  <div className="flex border-b border-border px-4">
                    <ProfileTabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                      Overview
                    </ProfileTabButton>
                    <ProfileTabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>
                      Activity
                    </ProfileTabButton>
                    <ProfileTabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
                      Settings
                    </ProfileTabButton>
                  </div>

                  <div className="p-6 md:p-8">
                    {activeTab === 'overview' && (
                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                        <div>
                          <h3 className="mb-4 text-foreground">Administrative Contribution</h3>
                          <div className="space-y-4">
                            <ContributionRow label="Papers managed" value={myPapers.length} detail="Papers created or handled by this admin" icon={FileText} />
                            <ContributionRow label="Approved papers" value={approvedPapers} detail="Papers available in the library" icon={CheckCircle2} />
                            <ContributionRow label="PDF files" value={pdfReadyPapers} detail="Papers with downloadable files" icon={Upload} />
                          </div>
                        </div>

                        <div>
                          <h3 className="mb-4 text-foreground">Badges</h3>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                            <BadgeItem active icon={ShieldCheck} title="Admin Account" />
                            <BadgeItem active icon={Lock} title="Secure Profile" />
                            <BadgeItem active={myPapers.length > 0} icon={FileText} title="Paper Manager" />
                            <BadgeItem active={pdfReadyPapers > 0} icon={Upload} title="PDF Manager" />
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'activity' && (
                      <div>
                        <div className="mb-5 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-foreground">Recent Activity</h3>
                            <p className="mt-1 text-muted-foreground">Latest movement from your research requests.</p>
                          </div>
                        </div>

                        {activityItems.length > 0 ? (
                          <div className="space-y-3">
                            {activityItems.map((item) => (
                              <ActivityRow key={item.id} item={item} />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
                            No activity yet. Your requests and PDF uploads will appear here.
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'settings' && (
                      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                        <section>
                          <div className="mb-6 flex items-center justify-between gap-4">
                            <h3 className="text-foreground">Personal Information</h3>
                            {!isEditing ? (
                              <button
                                onClick={() => setIsEditing(true)}
                                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-blue-600"
                              >
                                <Edit size={18} />
                                Edit
                              </button>
                            ) : (
                              <div className="flex gap-3">
                                <button
                                  onClick={handleCancel}
                                  className="rounded-lg border border-border px-4 py-2 transition-colors hover:bg-accent"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleSave}
                                  disabled={isSaving}
                                  className="rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {isSaving ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-5">
                            <ProfileField icon={User} label="Full Name" value={profile.fullName} isEditing={isEditing} inputValue={editForm.fullName} onChange={(value) => setEditForm({ ...editForm, fullName: value })} />
                            <ProfileField icon={Mail} label="Email" value={profile.email} disabled inputValue={editForm.email} isEditing={isEditing} />
                            <ProfileField icon={Building2} label="University" value={profile.university} isEditing={isEditing} inputValue={editForm.university} onChange={(value) => setEditForm({ ...editForm, university: value })} />
                            <ProfileField icon={Calendar} label="Member Since" value={profile.memberSince} disabled />
                          </div>
                        </section>

                        <section>
                          <div className="mb-6 flex items-center gap-2">
                            <Lock size={20} className="text-primary" />
                            <h3 className="text-foreground">Change Password</h3>
                          </div>

                          <form onSubmit={handleChangePassword} className="space-y-5">
                            <PasswordInput label="Current Password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm({ ...passwordForm, currentPassword: value })} placeholder="Enter your current password" autoComplete="current-password" show={showCurrentPassword} onToggle={() => setShowCurrentPassword((value) => !value)} />
                            <PasswordInput label="New Password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm({ ...passwordForm, newPassword: value })} placeholder="At least 8 characters" autoComplete="new-password" show={showNewPassword} onToggle={() => setShowNewPassword((value) => !value)} />
                            <PasswordStrengthChecklist password={passwordForm.newPassword} />
                            <PasswordInput label="Confirm New Password" value={passwordForm.confirmPassword} onChange={(value) => setPasswordForm({ ...passwordForm, confirmPassword: value })} placeholder="Re-enter new password" autoComplete="new-password" show={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} />

                            <button
                              type="submit"
                              disabled={isChangingPassword}
                              className="w-full rounded-lg bg-primary px-5 py-3 text-primary-foreground transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isChangingPassword ? 'Updating...' : 'Update Password'}
                            </button>
                          </form>
                        </section>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 rounded-lg border border-rose-200 bg-white shadow-sm">
                  <div className="p-6 md:p-8">
                    <h3 className="text-foreground">Danger Zone</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      If you need to remove this admin account, you can delete it with your password. Use this carefully.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        placeholder="Enter password to delete account"
                        className="flex-1 rounded-lg border border-border px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                      />
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="rounded-lg bg-red-600 px-5 py-3 text-white transition-colors hover:bg-red-700"
                      >
                        Delete Account
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete admin account?"
        description="This will permanently delete your account and sign you out."
        confirmLabel={isDeletingAccount ? 'Deleting...' : 'Delete account'}
        isLoading={isDeletingAccount}
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

function ProfileMetric({ label, value, icon: Icon }: { label: string; value: number; icon: ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon size={18} className="text-primary" />
      </div>
      <p className="text-foreground text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ProfileTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-4 text-sm font-medium transition-colors ${
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ContributionRow({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function BadgeItem({
  active,
  icon: Icon,
  title,
}: {
  active: boolean;
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-4 ${
        active ? 'border-green-200 bg-green-50 text-green-800' : 'border-border bg-muted text-muted-foreground'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium">{title}</span>
      {active && <ShieldCheck size={18} className="ml-auto" />}
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className="flex gap-4 rounded-lg border border-border p-4">
      <div className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${tones[item.tone]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium text-foreground">{item.title}</p>
          <span className="text-sm text-muted-foreground">{formatDisplayDate(item.date)}</span>
        </div>
        <p className="mt-1 truncate text-muted-foreground">{item.description}</p>
      </div>
    </div>
  );
}

function ProfileField({
  icon: Icon,
  label,
  value,
  isEditing,
  inputValue,
  onChange,
  disabled = false,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  isEditing?: boolean;
  inputValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-border p-4">
      <Icon size={20} className="mt-1 text-primary" />
      <div className="min-w-0 flex-1">
        <label className="mb-2 block text-sm text-muted-foreground">{label}</label>
        {isEditing && !disabled ? (
          <input
            value={inputValue}
            onChange={(event) => onChange?.(event.target.value)}
            className="w-full rounded-lg border border-border bg-input-background px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        ) : (
          <p className="break-words text-foreground">{value || 'N/A'}</p>
        )}
      </div>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  show,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-foreground">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-border bg-input-background px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

function buildRecentActivity(papers: PaperRequest[]): ActivityItem[] {
  const items = papers.flatMap((paper) => {
    const activities: ActivityItem[] = [
      {
        id: `${paper._id}-requested`,
        title: 'Requested a paper',
        description: paper.title || 'Research request',
        date: (paper as { createdAt?: string }).createdAt || new Date().toISOString(),
        tone: 'blue',
      },
    ];

    if (paper.pdfPath) {
      activities.push({
        id: `${paper._id}-pdf`,
        title: 'Uploaded a PDF',
        description: paper.title || 'Research request',
        date: (paper as { uploadedAt?: string }).uploadedAt || (paper as { updatedAt?: string }).updatedAt || new Date().toISOString(),
        tone: 'green',
      });
    }

    if (paper.status === 'rejected') {
      activities.push({
        id: `${paper._id}-rejected`,
        title: 'Paper was rejected',
        description: paper.title || 'Research request',
        date: (paper as { updatedAt?: string }).updatedAt || (paper as { createdAt?: string }).createdAt || new Date().toISOString(),
        tone: 'red',
      });
    } else if (
      paper.status === 'downloaded' ||
      paper.status === 'not-downloaded' ||
      paper.status === 'approved' ||
      paper.status === 'pending-requester-acceptance'
    ) {
      activities.push({
        id: `${paper._id}-approved`,
        title: 'Paper was approved',
        description: paper.title || 'Research request',
        date: (paper as { updatedAt?: string }).updatedAt || (paper as { createdAt?: string }).createdAt || new Date().toISOString(),
        tone: paper.status === 'downloaded' ? 'green' : 'amber',
      });
    }

    return activities;
  });

  return items
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 8);
}
