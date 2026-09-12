import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { AppHeader } from '../components/AppHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastProvider';
import { Search, Eye, Ban, CheckCircle, Filter, Shield, Trash2, X } from 'lucide-react';
import { apiRequest, AuthUser, getStoredUser } from '../lib/api';
import { formatDisplayDate } from '../lib/date';

type ManagedUser = AuthUser & {
  createdAt?: string;
};

type UserRanking = {
  rank: number;
  points: number;
  uploadedPapers?: number;
  uploadedPdfs?: number;
  ratingsGiven?: number;
};

function formatDate(value?: string) {
  return formatDisplayDate(value);
}

function getUserStatus(user: ManagedUser) {
  return user.status || 'active';
}

function matchesSearch(user: ManagedUser, searchTerm: string) {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return true;

  return [user.fullName, user.email, user.university]
    .some((value) => value?.toLowerCase().includes(query));
}

export function UserManagementPage() {
  const { showToast } = useToast();
  const currentUser = getStoredUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false);
  const [selectedUserRanking, setSelectedUserRanking] = useState<UserRanking | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  useEffect(() => {
    if (!showDetailModal) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [showDetailModal]);

  async function loadUsers() {
    setIsLoading(true);

    try {
      const data = await apiRequest<{ users: ManagedUser[] }>('/users', { auth: true });
      setAllUsers(data.users);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to load users', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const users = useMemo(
    () => allUsers.filter((user) => {
      const matchesStatus = filterStatus === 'all' || getUserStatus(user) === filterStatus;
      const matchesRole = filterRole === 'all' || user.role === filterRole;

      return matchesSearch(user, searchTerm) && matchesStatus && matchesRole;
    }),
    [allUsers, searchTerm, filterStatus, filterRole]
  );

  const stats = {
    total: allUsers.length,
    active: allUsers.filter((user) => getUserStatus(user) === 'active').length,
    banned: allUsers.filter((user) => getUserStatus(user) === 'banned').length,
  };

  const updateUserStatus = async (userId: string, status: 'active' | 'banned') => {
    try {
      const data = await apiRequest<{ user: ManagedUser }>(`/users/${userId}/status`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({ status }),
      });

      setAllUsers((items) => items.map((user) => (user._id === userId ? data.user : user)));
      setSelectedUser((user) => (user?._id === userId ? data.user : user));
      showToast(`User ${status === 'banned' ? 'banned' : 'unbanned'} successfully.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update user status', 'error');
    }
  };

  const updateUserRole = async (userId: string, role: 'user' | 'admin') => {
    try {
      const data = await apiRequest<{ user: ManagedUser }>(`/users/${userId}`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({ role }),
      });

      setAllUsers((items) => items.map((user) => (user._id === userId ? data.user : user)));
      setSelectedUser((user) => (user?._id === userId ? data.user : user));
      showToast('User role updated successfully.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update user role', 'error');
    }
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    setIsDeletingUser(true);

    try {
      await apiRequest(`/users/${userToDelete._id}`, {
        method: 'DELETE',
        auth: true,
      });

      setAllUsers((items) => items.filter((item) => item._id !== userToDelete._id));
      setSelectedUser(null);
      setUserToDelete(null);
      setShowDetailModal(false);
      showToast('User deleted successfully.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to delete user', 'error');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleViewDetails = async (user: ManagedUser) => {
    setSelectedUser(user);
    setShowDetailModal(true);
    setIsLoadingUserDetails(true);
    setSelectedUserRanking(null);

    try {
      const [userData, rankingData] = await Promise.all([
        apiRequest<{ user: ManagedUser }>(`/users/${user._id}`, { auth: true }),
        apiRequest<{ ranking: UserRanking }>(`/rankings/users/${user._id}`, { auth: true }).catch(() => ({ ranking: null })),
      ]);

      const data = userData;
      setSelectedUser(data.user);
      setSelectedUserRanking(rankingData.ranking);
      setAllUsers((items) => items.map((item) => (item._id === user._id ? data.user : item)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to load user profile', 'error');
    } finally {
      setIsLoadingUserDetails(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-surface-workspace bg-fixed">
      <Sidebar role="admin" />

      <div className="min-w-0 flex-1 p-8">
        <AppHeader role="admin" />
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-foreground mb-2">User Management</h1>
            <p className="text-muted-foreground">Manage users and their access to the system</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg border border-border shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground mb-1">Total Users</p>
                  <h3 className="text-foreground">{stats.total}</h3>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Eye size={24} className="text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-border shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground mb-1">Active Users</p>
                  <h3 className="text-foreground">{stats.active}</h3>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <CheckCircle size={24} className="text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-border shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground mb-1">Banned Users</p>
                  <h3 className="text-foreground">{stats.banned}</h3>
                </div>
                <div className="bg-red-100 p-3 rounded-lg">
                  <Ban size={24} className="text-red-600" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-border shadow-sm p-6 mb-6">
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, email, or university..."
                  maxLength={128}
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="pl-10 pr-8 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background appearance-none"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="banned">Banned</option>
                </select>
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="pl-10 pr-8 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background appearance-none"
                >
                  <option value="all">All Roles</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-6 py-4 text-left text-foreground">User</th>
                    <th className="px-6 py-4 text-left text-foreground">University</th>
                    <th className="px-6 py-4 text-left text-foreground">Role</th>
                    <th className="px-6 py-4 text-left text-foreground">Joined</th>
                    <th className="px-6 py-4 text-left text-foreground">Status</th>
                    <th className="px-6 py-4 text-left text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id} className="border-b border-border hover:bg-accent transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <button
                            type="button"
                            onClick={() => handleViewDetails(user)}
                            className="text-left text-foreground hover:underline"
                          >
                            {user.fullName}
                          </button>
                          <p className="text-muted-foreground">{user.email}</p>
                          {/* Student ID removed */}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{user.university}</td>
                      <td className="px-6 py-4">
                        <select
                          value={user.role}
                          onChange={(e) => updateUserRole(user._id, e.target.value as 'user' | 'admin')}
                          disabled={user._id === currentUser?._id}
                          className="px-3 py-2 border border-border rounded-lg bg-input-background disabled:opacity-60"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(user.createdAt)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full border ${
                          getUserStatus(user) === 'active'
                            ? 'bg-green-100 text-green-800 border-green-200'
                            : 'bg-red-100 text-red-800 border-red-200'
                        }`}>
                          {getUserStatus(user) === 'active' ? 'Active' : 'Banned'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewDetails(user)}
                            className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                            title="View details"
                          >
                            <Eye size={18} className="text-blue-600" />
                          </button>

                          {getUserStatus(user) === 'active' ? (
                            <button
                              onClick={() => updateUserStatus(user._id, 'banned')}
                              disabled={user._id === currentUser?._id}
                              className="p-2 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40"
                              title="Ban user"
                            >
                              <Ban size={18} className="text-red-600" />
                            </button>
                          ) : (
                            <button
                              onClick={() => updateUserStatus(user._id, 'active')}
                              className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                              title="Unban user"
                            >
                              <CheckCircle size={18} className="text-green-600" />
                            </button>
                          )}

                          <button
                            onClick={() => setUserToDelete(user)}
                            disabled={user._id === currentUser?._id}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40"
                            title="Delete user"
                          >
                            <Trash2 size={18} className="text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isLoading && (
              <div className="p-12 text-center">
                <p className="text-muted-foreground">Loading users...</p>
              </div>
            )}

            {!isLoading && users.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-muted-foreground">No users found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDetailModal && selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-6">
              <div>
                <p className="text-sm text-muted-foreground">User profile</p>
                <h2 className="text-foreground">{selectedUser.fullName || 'User Details'}</h2>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-accent rounded-lg transition-colors"
                aria-label="Close user details"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[calc(90vh-156px)] overflow-y-auto overscroll-contain p-6">
              <div className="mb-6 flex items-center gap-4 rounded-lg border border-border bg-muted/60 p-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-foreground text-xl font-semibold text-white">
                  {(selectedUser.fullName || 'U')
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join('') || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-medium text-foreground">{selectedUser.fullName}</p>
                  <p className="truncate text-muted-foreground">{selectedUser.email}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
                  getUserStatus(selectedUser) === 'active'
                    ? 'border-green-200 bg-green-100 text-green-800'
                    : 'border-red-200 bg-red-100 text-red-800'
                }`}>
                  {getUserStatus(selectedUser) === 'active' ? 'Active' : 'Banned'}
                </span>
              </div>

              {isLoadingUserDetails && (
                <div className="mb-4 rounded-lg border border-border bg-white p-4 text-muted-foreground">
                  Loading latest profile...
                </div>
              )}

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground mb-1">Full Name</p>
                  <p className="text-foreground">{selectedUser.fullName}</p>
                </div>
                {/* Student ID removed from user details */}
                <div>
                  <p className="text-muted-foreground mb-1">Email</p>
                  <p className="text-foreground">{selectedUser.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">University</p>
                  <p className="text-foreground">{selectedUser.university}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Join Date</p>
                  <p className="text-foreground">{formatDate(selectedUser.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Role</p>
                  <p className="text-foreground flex items-center gap-2">
                    <Shield size={16} />
                    {selectedUser.role}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Ranking</p>
                  <p className="text-foreground">
                    {selectedUserRanking ? `Rank #${selectedUserRanking.rank}` : 'Rank N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Ranking Points</p>
                  <p className="text-foreground">{selectedUserRanking?.points ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Status</p>
                  <span className={`px-3 py-1 rounded-full border ${
                    getUserStatus(selectedUser) === 'active'
                      ? 'bg-green-100 text-green-800 border-green-200'
                      : 'bg-red-100 text-red-800 border-red-200'
                  }`}>
                    {getUserStatus(selectedUser) === 'active' ? 'Active' : 'Banned'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 p-6 border-t border-border">
              <button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 px-6 py-3 border border-border rounded-lg hover:bg-accent transition-colors"
              >
                Close
              </button>
              {getUserStatus(selectedUser) === 'active' ? (
                <button
                  onClick={() => updateUserStatus(selectedUser._id, 'banned')}
                  disabled={selectedUser._id === currentUser?._id}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  Ban User
                </button>
              ) : (
                <button
                  onClick={() => updateUserStatus(selectedUser._id, 'active')}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Unban User
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(userToDelete)}
        title="Delete user?"
        description={`This will permanently delete "${userToDelete?.fullName || 'this user'}" and their own paper requests.`}
        confirmLabel="Delete user"
        isLoading={isDeletingUser}
        onConfirm={deleteUser}
        onCancel={() => setUserToDelete(null)}
      />
    </div>
  );
}
