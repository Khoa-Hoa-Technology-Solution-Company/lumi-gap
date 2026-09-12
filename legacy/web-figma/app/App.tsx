import type React from 'react';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router';
import { useLocation, useNavigate } from 'react-router';
import { AUTH_CHANGED_EVENT, clearAuth, getStoredUser, getToken } from './lib/api';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ToastProvider } from './components/ToastProvider';

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const ExplorePage = lazy(() => import('./pages/ExplorePage').then((module) => ({ default: module.ExplorePage })));
const PublicRankingsPage = lazy(() => import('./pages/PublicRankingsPage').then((module) => ({ default: module.PublicRankingsPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const UserDashboard = lazy(() => import('./pages/UserDashboard').then((module) => ({ default: module.UserDashboard })));
const MyRequestsPage = lazy(() => import('./pages/MyRequestsPage').then((module) => ({ default: module.MyRequestsPage })));
const UserRankingPage = lazy(() => import('./pages/UserRankingPage').then((module) => ({ default: module.UserRankingPage })));
const UserPublicProfilePage = lazy(() => import('./pages/UserPublicProfilePage').then((module) => ({ default: module.UserPublicProfilePage })));
const UserProfileSettingsPage = lazy(() => import('./pages/UserProfileSettingsPage').then((module) => ({ default: module.UserProfileSettingsPage })));
const RequestPaperPage = lazy(() => import('./pages/RequestPaperPage').then((module) => ({ default: module.RequestPaperPage })));
const AdminBrowseDashboard = lazy(() => import('./pages/AdminBrowseDashboard').then((module) => ({ default: module.AdminBrowseDashboard })));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const AdminProfilePage = lazy(() => import('./pages/AdminProfilePage').then((module) => ({ default: module.AdminProfilePage })));
const PaperManagementPage = lazy(() => import('./pages/PaperManagementPage').then((module) => ({ default: module.PaperManagementPage })));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage').then((module) => ({ default: module.UserManagementPage })));
const PaperDetailPage = lazy(() => import('./pages/PaperDetailPage').then((module) => ({ default: module.PaperDetailPage })));

const LAST_PATH_KEY = 'last-pathname';
const PUBLIC_PATHS = new Set(['/', '/explore', '/rankings', '/login', '/register']);

function AdminRouteGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const lastPath = sessionStorage.getItem(LAST_PATH_KEY);
    const currentUser = getStoredUser();

    if (location.pathname === '/' && lastPath?.startsWith('/admin') && currentUser?.role === 'admin' && getToken()) {
      clearAuth();
      sessionStorage.removeItem(LAST_PATH_KEY);
      navigate('/login', { replace: true });
      return;
    }

    sessionStorage.setItem(LAST_PATH_KEY, location.pathname);
  }, [location.pathname, navigate]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionStorage.setItem(LAST_PATH_KEY, location.pathname);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [location.pathname]);

  return null;
}

function AuthSessionGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthChanged = () => {
      if (!PUBLIC_PATHS.has(location.pathname) && (!getToken() || !getStoredUser())) {
        navigate('/login', { replace: true });
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'token' || event.key === 'user') {
        handleAuthChanged();
      }
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, [location.pathname, navigate]);

  return null;
}

function ProtectedRoute({
  children,
  role,
}: {
  children: React.ReactElement;
  role?: 'user' | 'admin';
}) {
  const token = getToken();
  const user = getStoredUser();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  return children;
}

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <AdminRouteGuard />
        <AuthSessionGuard />
        <Suspense fallback={<LoadingSpinner fullPage label="Loading page..." />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/rankings" element={<PublicRankingsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard" element={<ProtectedRoute role="user"><UserDashboard /></ProtectedRoute>} />
            <Route path="/my-requests" element={<ProtectedRoute role="user"><MyRequestsPage /></ProtectedRoute>} />
            <Route path="/dashboard/rankings" element={<ProtectedRoute role="user"><UserRankingPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute role="user"><UserPublicProfilePage /></ProtectedRoute>} />
            <Route path="/profile/settings" element={<Navigate to="/settings/profile" replace />} />
            <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
            <Route path="/settings/:section" element={<ProtectedRoute role="user"><UserProfileSettingsPage /></ProtectedRoute>} />
            <Route path="/request-paper" element={<ProtectedRoute role="user"><RequestPaperPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute role="admin"><AdminBrowseDashboard /></ProtectedRoute>} />
            <Route path="/admin/stats" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/profile" element={<ProtectedRoute role="admin"><AdminProfilePage /></ProtectedRoute>} />
            <Route path="/admin/papers" element={<ProtectedRoute role="admin"><PaperManagementPage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute role="admin"><UserManagementPage /></ProtectedRoute>} />
            <Route path="/admin/post-paper" element={<ProtectedRoute role="admin"><RequestPaperPage role="admin" /></ProtectedRoute>} />
            <Route path="/paper/:id" element={<ProtectedRoute><PaperDetailPage /></ProtectedRoute>} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </Router>
  );
}
