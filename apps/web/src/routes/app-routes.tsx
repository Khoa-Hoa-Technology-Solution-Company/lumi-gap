import { lazy, Suspense } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { AdminLayout } from "@/layouts/AdminLayout";
import { ProtectedRoute } from "@/components/protected-route";

const HomePage = lazy(() => import("@/pages/home").then((m) => ({ default: m.HomePage })));
const AuthLayout = lazy(() => import("@/layouts/AuthLayout").then((m) => ({ default: m.AuthLayout })));
const LoginPage = lazy(() => import("@/pages/login").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/register").then((m) => ({ default: m.RegisterPage })));
const OAuthCallbackPage = lazy(() => import("@/pages/oauth-callback").then((m) => ({ default: m.OAuthCallbackPage })));
const AcademicProfileOnboardingPage = lazy(() => import("@/pages/academic-profile-onboarding").then((m) => ({ default: m.AcademicProfileOnboardingPage })));
const DashboardPage = lazy(() => import("@/pages/dashboard").then((m) => ({ default: m.DashboardPage })));
const SearchPage = lazy(() => import("@/pages/search").then((m) => ({ default: m.SearchPage })));
const TrendsPage = lazy(() => import("@/pages/trends").then((m) => ({ default: m.TrendsPage })));
const TopicDetailPage = lazy(() => import("@/pages/trends-topic").then((m) => ({ default: m.TopicDetailPage })));
const BookmarksPage = lazy(() => import("@/pages/bookmarks").then((m) => ({ default: m.BookmarksPage })));
const NotificationsPage = lazy(() => import("@/pages/notifications").then((m) => ({ default: m.NotificationsPage })));
const ProfilePage = lazy(() => import("@/pages/profile").then((m) => ({ default: m.ProfilePage })));
const PaperDetailPage = lazy(() => import("@/pages/papers/paper-detail").then((m) => ({ default: m.PaperDetailPage })));
const PaperReviewPage = lazy(() => import("@/pages/papers/paper-review").then((m) => ({ default: m.PaperReviewPage })));
const FormatCheckerPage = lazy(() => import("@/pages/papers/format-checker").then((m) => ({ default: m.FormatCheckerPage })));
const ReportsListPage = lazy(() => import("@/pages/reports/reports-list").then((m) => ({ default: m.ReportsListPage })));
const ReportViewerPage = lazy(() => import("@/pages/reports/report-viewer").then((m) => ({ default: m.ReportViewerPage })));
const ProjectsListPage = lazy(() => import("@/pages/projects/projects-list").then((m) => ({ default: m.ProjectsListPage })));
const ProjectDetailPage = lazy(() => import("@/pages/projects/project-detail").then((m) => ({ default: m.ProjectDetailPage })));
const ResearchGapsPage = lazy(() => import("@/pages/research-gaps").then((m) => ({ default: m.ResearchGapsPage })));
const AdminSyncPage = lazy(() => import("@/pages/admin/sync").then((m) => ({ default: m.AdminSyncPage })));
const AdminPipelinePage = lazy(() => import("@/pages/admin/pipeline").then((m) => ({ default: m.AdminPipelinePage })));
const AdminEvaluationPage = lazy(() => import("@/pages/admin/evaluation").then((m) => ({ default: m.AdminEvaluationPage })));
const AdminPapersPage = lazy(() => import("@/pages/admin/papers").then((m) => ({ default: m.AdminPapersPage })));
const SubmitPaperPage = lazy(() => import("@/pages/papers/submit-paper").then((m) => ({ default: m.SubmitPaperPage })));
const AdminUsersPage = lazy(() => import("@/pages/admin/users").then((m) => ({ default: m.AdminUsersPage })));
const AdminAcademicVerificationsPage = lazy(() => import("@/pages/admin/academic-verifications").then((m) => ({ default: m.AdminAcademicVerificationsPage })));
const AdminHomePage = lazy(() => import("@/pages/admin").then((m) => ({ default: m.AdminHomePage })));
const NotFoundPage = lazy(() => import("@/pages/not-found").then((m) => ({ default: m.NotFoundPage })));
const RankingsPage = lazy(() => import("@/pages/rankings").then((m) => ({ default: m.RankingsPage })));
const ForumListPage = lazy(() => import("@/pages/forum/forum-list").then((m) => ({ default: m.ForumListPage })));
const ForumDetailPage = lazy(() => import("@/pages/forum/forum-detail").then((m) => ({ default: m.ForumDetailPage })));
const ForumNewPage = lazy(() => import("@/pages/forum/forum-new").then((m) => ({ default: m.ForumNewPage })));
const CommunityListPage = lazy(() => import("@/pages/communities/community-list").then((m) => ({ default: m.CommunityListPage })));
const CommunityDetailPage = lazy(() => import("@/pages/communities/community-detail").then((m) => ({ default: m.CommunityDetailPage })));

function RouteLoading() {
  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-[#09090b]"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading page...</span>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/onboarding/academic-profile" element={<AcademicProfileOnboardingPage />} />

        <Route element={<MainLayout />}>
          {/* Public */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/papers/:id" element={<PaperDetailPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/trends/:topic" element={<TopicDetailPage />} />
          <Route path="/forum" element={<ForumListPage />} />
          <Route path="/forum/:id" element={<ForumDetailPage />} />
          <Route path="/communities" element={<CommunityListPage />} />
          <Route path="/communities/:slug" element={<CommunityDetailPage />} />

          {/* Protected (any signed-in user) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/papers/submit" element={<Navigate to="/settings/submit-paper" replace />} />
            <Route path="/papers/review" element={<PaperReviewPage />} />
            <Route path="/papers/format-check" element={<FormatCheckerPage />} />
            <Route path="/my-papers" element={<Navigate to="/settings/my-papers" replace />} />
            <Route path="/settings" element={<Navigate to="/profile" replace />} />
            <Route path="/settings/:section" element={<ProfilePage />} />
            <Route path="/reports" element={<ReportsListPage />} />
            <Route path="/reports/:id" element={<ReportViewerPage />} />
            <Route path="/projects" element={<ProjectsListPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/research-gaps" element={<ResearchGapsPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
            <Route path="/forum/new" element={<ForumNewPage />} />

            {/* Admin — nested under AdminLayout (sidebar + role gate) */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminHomePage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="academic-verifications" element={<AdminAcademicVerificationsPage />} />
              <Route path="papers" element={<AdminPapersPage />} />
              <Route path="papers/new" element={<SubmitPaperPage />} />
              <Route path="sync" element={<AdminSyncPage />} />
              <Route path="pipeline" element={<AdminPipelinePage />} />
              <Route path="evaluation" element={<AdminEvaluationPage />} />
              <Route path="analytics" element={<DashboardPage />} />
            </Route>
          </Route>

          {/* 404 catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/oauth-callback" element={<OAuthCallbackPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
