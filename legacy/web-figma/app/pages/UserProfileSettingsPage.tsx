import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Bell, Lock, Palette, Save, Settings2, User } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PasswordStrengthChecklist } from '../components/PasswordStrengthChecklist';
import { apiRequest, AuthUser, clearAuth, getStoredUser, getToken, saveAuth } from '../lib/api';
import { getPasswordStrengthError } from '../lib/passwordStrength';

type SettingsSection = 'profile' | 'customization' | 'notifications' | 'account';

type ProfileForm = {
  fullName: string;
  university: string;
  email: string;
};

const emptyProfile: ProfileForm = { fullName: '', university: '', email: '' };

export function UserProfileSettingsPage() {
  const storedUser = getStoredUser();
  const { section = 'profile' } = useParams();
  const activeSection: SettingsSection = ['profile', 'customization', 'notifications', 'account'].includes(section)
    ? (section as SettingsSection)
    : 'profile';
  const [profile, setProfile] = useState<ProfileForm>(
    storedUser ? { fullName: storedUser.fullName, university: storedUser.university, email: storedUser.email } : emptyProfile
  );
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const profileHandle = profile.fullName.trim().toLowerCase().replace(/\s+/g, '_') || 'profile';

  useEffect(() => {
    apiRequest<{ user: AuthUser }>('/auth/me', { auth: true }).then(({ user }) => {
      setProfile({ fullName: user.fullName, university: user.university, email: user.email });
    });
  }, []);

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSaving(true);

    try {
      const { user } = await apiRequest<{ user: AuthUser }>('/auth/me', {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({ fullName: profile.fullName, university: profile.university }),
      });
      const token = getToken();
      if (token) saveAuth(token, user);
      setProfile({ fullName: user.fullName, university: user.university, email: user.email });
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const passwordError = getPasswordStrengthError(passwordForm.newPassword, 'New password');
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const { token } = await apiRequest<{ token: string }>('/auth/change-password', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(passwordForm),
      });
      const currentUser = getStoredUser();
      if (currentUser) saveAuth(token, currentUser);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Password changed successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setError('');
    setIsDeletingAccount(true);

    try {
      await apiRequest('/auth/me', {
        method: 'DELETE',
        auth: true,
        body: JSON.stringify({ password: deletePassword }),
      });
      clearAuth();
      window.location.href = '/login';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete account.');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f3f0]">
      <AppHeader role="user" />

      <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-12 pt-24 md:grid-cols-[240px_minmax(0,1fr)] md:pt-10">
        <aside>
          <Link to="/profile" className="mb-3 block px-3 text-2xl font-semibold text-primary">
            @{profileHandle}
          </Link>
          <nav className="space-y-1">
            <SettingsNav to="/settings/profile" icon={User} label="Profile" active={activeSection === 'profile'} />
            <SettingsNav to="/settings/customization" icon={Palette} label="Customization" active={activeSection === 'customization'} />
            <SettingsNav to="/settings/notifications" icon={Bell} label="Notifications" active={activeSection === 'notifications'} />
            <SettingsNav to="/settings/account" icon={Settings2} label="Account" active={activeSection === 'account'} />
          </nav>
        </aside>

        <section className="min-w-0">
          {message && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{message}</div>}
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

          {activeSection === 'profile' && (
            <SettingsCard title="Profile">
              <form onSubmit={handleSaveProfile} className="space-y-5">
                <TextInput label="Name" value={profile.fullName} onChange={(value) => setProfile({ ...profile, fullName: value })} />
                <TextInput label="Email" value={profile.email} disabled onChange={() => undefined} />
                <TextInput label="University" value={profile.university} onChange={(value) => setProfile({ ...profile, university: value })} />
                <button disabled={isSaving} className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-semibold text-white disabled:opacity-60">
                  <Save size={18} />
                  {isSaving ? 'Saving...' : 'Save profile information'}
                </button>
              </form>
            </SettingsCard>
          )}

          {(activeSection === 'customization' || activeSection === 'notifications') && (
            <SettingsCard title={activeSection === 'customization' ? 'Customization' : 'Notifications'}>
              <p className="text-muted-foreground">This section is ready for future preferences.</p>
            </SettingsCard>
          )}

          {activeSection === 'account' && (
            <div className="space-y-6">
            <SettingsCard title="Account">
              <form onSubmit={handleChangePassword} className="max-w-xl space-y-5">
                <div className="flex items-center gap-2">
                  <Lock size={19} className="text-primary" />
                  <h3 className="font-semibold text-foreground">Change password</h3>
                </div>
                <PasswordInput label="Current password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm({ ...passwordForm, currentPassword: value })} />
                <PasswordInput label="New password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm({ ...passwordForm, newPassword: value })} />
                <PasswordStrengthChecklist password={passwordForm.newPassword} />
                <PasswordInput label="Confirm new password" value={passwordForm.confirmPassword} onChange={(value) => setPasswordForm({ ...passwordForm, confirmPassword: value })} />
                <button disabled={isSaving} className="rounded-md bg-primary px-5 py-3 font-semibold text-white disabled:opacity-60">
                  {isSaving ? 'Updating...' : 'Update password'}
                </button>
              </form>
            </SettingsCard>

            <div className="rounded-lg border border-red-200 bg-white p-6 shadow-sm md:p-8">
              <h2 className="text-2xl font-semibold text-red-600">Danger Zone</h2>
              <h3 className="mt-7 text-lg font-semibold text-foreground">Delete account</h3>
              <p className="mt-3 text-muted-foreground">
                Deleting your account will permanently remove your profile and your paper requests. This action cannot be undone.
              </p>
              <div className="mt-5 max-w-xl">
                <label className="block">
                  <span className="mb-2 block font-medium text-foreground">Confirm your password</span>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-md border border-border bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                  />
                </label>
                <button
                  type="button"
                  disabled={!deletePassword}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="mt-4 rounded-md bg-red-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete account
                </button>
              </div>
            </div>
            </div>
          )}
        </section>
      </main>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete your account?"
        description="This will permanently delete your profile and paper requests, then sign you out."
        confirmLabel="Delete account"
        isLoading={isDeletingAccount}
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

function SettingsNav({ to, icon: Icon, label, active }: { to: string; icon: typeof User; label: string; active: boolean }) {
  return (
    <Link to={to} className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left ${active ? 'bg-white font-semibold shadow-sm' : 'text-muted-foreground hover:bg-white/70'}`}>
      <Icon size={20} />
      {label}
    </Link>
  );
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-white p-6 shadow-sm md:p-8">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">{title}</h1>
      {children}
    </div>
  );
}

function TextInput({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block font-medium text-foreground">{label}</span>
      <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-border bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-primary disabled:bg-muted" />
    </label>
  );
}

function PasswordInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block font-medium text-foreground">{label}</span>
      <input type="password" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-border bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
    </label>
  );
}
