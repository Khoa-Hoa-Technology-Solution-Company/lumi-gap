import { lazy, Suspense } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { MainLayout } from "@/layouts/MainLayout";
import { ProtectedRoute } from "@/components/protected-route";

const AdminLayout = lazy(() => import("@/layouts/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const HomePage = lazy(() => import("@/pages/home").then((m) => ({ default: m.HomePage })));
const AuthLayout = lazy(() => import("@/layouts/AuthLayout").then((m) => ({ default: m.AuthLayout })));
const LoginPage = lazy(() => import("@/pages/login").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/register").then((m) => ({ default: m.RegisterPage })));
const OAuthCallbackPage = lazy(() => import("@/pages/oauth-callback").then((m) => ({ default: m.OAuthCallbackPage })));
const VerifyEmailPage = lazy(() => import("@/pages/verify-email").then((m) => ({ default: m.VerifyEmailPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password").then((m) => ({ default: m.ResetPasswordPage })));
const AcademicProfileOnboardingPage = lazy(() => import("@/pages/academic-profile-onboarding").then((m) => ({ default: m.AcademicProfileOnboardingPage })));
const DashboardPage = lazy(() => import("@/pages/dashboard").then((m) => ({ default: m.DashboardPage })));
const SearchPage = lazy(() => import("@/pages/search").then((m) => ({ default: m.SearchPage })));
const TrendsPage = lazy(() => import("@/pages/trends").then((m) => ({ default: m.TrendsPage })));
const TopicDetailPage = lazy(() => import("@/pages/trends-topic").then((m) => ({ default: m.TopicDetailPage })));
const BookmarksPage = lazy(() => import("@/pages/bookmarks").then((m) => ({ default: m.BookmarksPage })));
const NotificationsPage = lazy(() => import("@/pages/notifications").then((m) => ({ default: m.NotificationsPage })));
const AccountSettingsPage = lazy(() => import("@/pages/profile").then((m) => ({ default: m.AccountSettingsPage })));
const ProfilePage = lazy(() => import("@/pages/profile-overview").then((m) => ({ default: m.ProfilePage })));
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
const AdminProfilesPage = lazy(() => import("@/pages/admin/profiles").then((m) => ({ default: m.AdminProfilesPage })));
const AdminAcademicVerificationsPage = lazy(() => import("@/pages/admin/academic-verifications").then((m) => ({ default: m.AdminAcademicVerificationsPage })));
const AdminCorpusValidationPage = lazy(() => import("@/pages/admin/corpus-validation").then((m) => ({ default: m.AdminCorpusValidationPage })));
const AdminCommunityPage = lazy(() => import("@/pages/admin/community").then((m) => ({ default: m.AdminCommunityPage })));
const AdminAiJobsPage = lazy(() => import("@/pages/admin/ai-jobs").then((m) => ({ default: m.AdminAiJobsPage })));
const AdminAuditLogsPage = lazy(() => import("@/pages/admin/audit-logs").then((m) => ({ default: m.AdminAuditLogsPage })));
const AdminWorkersPage = lazy(() => import("@/pages/admin/workers").then((m) => ({ default: m.AdminWorkersPage })));
const AdminSettingsPage = lazy(() => import("@/pages/admin/settings").then((m) => ({ default: m.AdminSettingsPage })));
const AdminHomePage = lazy(() => import("@/pages/admin").then((m) => ({ default: m.AdminHomePage })));
const NotFoundPage = lazy(() => import("@/pages/not-found").then((m) => ({ default: m.NotFoundPage })));
const RankingsPage = lazy(() => import("@/pages/rankings").then((m) => ({ default: m.RankingsPage })));
const ForumListPage = lazy(() => import("@/pages/forum/forum-list").then((m) => ({ default: m.ForumListPage })));
const ForumDetailPage = lazy(() => import("@/pages/forum/forum-detail").then((m) => ({ default: m.ForumDetailPage })));
const ForumNewPage = lazy(() => import("@/pages/forum/forum-new").then((m) => ({ default: m.ForumNewPage })));
const CommunityListPage = lazy(() => import("@/pages/communities/community-list").then((m) => ({ default: m.CommunityListPage })));
const CommunityDetailPage = lazy(() => import("@/pages/communities/community-detail").then((m) => ({ default: m.CommunityDetailPage })));
const CommunityNewPage = lazy(() => import("@/pages/communities/community-new").then((m) => ({ default: m.CommunityNewPage })));
const CommunityManagePage = lazy(() => import("@/pages/communities/community-manage").then((m) => ({ default: m.CommunityManagePage })));
const LecturerDirectoryPage = lazy(() => import("@/pages/academics/lecturer-directory").then((m) => ({ default: m.LecturerDirectoryPage })));
const PublicAcademicProfilePage = lazy(() => import("@/pages/academics/public-academic-profile").then((m) => ({ default: m.PublicAcademicProfilePage })));
const ReviewOpportunitiesPage = lazy(() => import("@/pages/reviews/review-opportunities").then((m) => ({ default: m.ReviewOpportunitiesPage })));
const ReviewDashboardPage = lazy(() => import("@/pages/reviews/review-dashboard").then((m) => ({ default: m.ReviewDashboardPage })));
const ReviewWorkspacePage = lazy(() => import("@/pages/reviews/review-workspace").then((m) => ({ default: m.ReviewWorkspacePage })));
const SubmissionListPage = lazy(() => import("@/pages/submissions/submission-list").then((m) => ({ default: m.SubmissionListPage })));
const SubmissionNewPage = lazy(() => import("@/pages/submissions/submission-new").then((m) => ({ default: m.SubmissionNewPage })));
const SubmissionDetailPage = lazy(() => import("@/pages/submissions/submission-detail").then((m) => ({ default: m.SubmissionDetailPage })));
const ContributionArchivePage = lazy(() => import("@/pages/academics/contribution-archive").then((m) => ({ default: m.ContributionArchivePage })));
const ResearchGapDiscoverPage = lazy(() => import("@/pages/research-gap-discover").then((m) => ({ default: m.ResearchGapDiscoverPage })));

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

        {/* Standalone Admin Section (No MainLayout header/footer) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminHomePage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="profiles" element={<Navigate to="/admin/users" replace />} />
            <Route path="academic-verifications" element={<AdminAcademicVerificationsPage />} />
            <Route path="papers" element={<AdminPapersPage />} />
            <Route path="papers/new" element={<SubmitPaperPage />} />
            <Route path="sync" element={<AdminSyncPage />} />
            <Route path="pipeline" element={<AdminPipelinePage />} />
            <Route path="corpus-validation" element={<AdminCorpusValidationPage />} />
            <Route path="community" element={<AdminCommunityPage />} />
            <Route path="ai-jobs" element={<AdminAiJobsPage />} />
            <Route path="evaluation" element={<AdminEvaluationPage />} />
            <Route path="audit-logs" element={<AdminAuditLogsPage />} />
            <Route path="workers" element={<AdminWorkersPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
            <Route path="analytics" element={<DashboardPage />} />
          </Route>
        </Route>

        {/* Main Application with Header & Footer */}
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
          <Route path="/lecturers" element={<LecturerDirectoryPage />} />
          <Route path="/academics/:userId" element={<PublicAcademicProfilePage />} />
          <Route path="/u/:handle" element={<PublicAcademicProfilePage />} />
          <Route path="/profile/:handle/contributions" element={<ContributionArchivePage />} />

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
            <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
            <Route path="/settings/:section" element={<AccountSettingsPage />} />
            <Route path="/reports" element={<ReportsListPage />} />
            <Route path="/reports/:id" element={<ReportViewerPage />} />
            <Route path="/projects" element={<ProjectsListPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/research-gaps" element={<ResearchGapsPage />} />
            <Route path="/research-gap/discover" element={<ResearchGapDiscoverPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
            <Route path="/review-opportunities" element={<ReviewOpportunitiesPage />} />
            <Route path="/reviews" element={<ReviewDashboardPage />} />
            <Route path="/reviews/:assignmentId" element={<ReviewWorkspacePage />} />
            <Route path="/submissions" element={<SubmissionListPage />} />
            <Route path="/submissions/new" element={<SubmissionNewPage />} />
            <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
            <Route path="/forum/new" element={<ForumNewPage />} />
            <Route path="/communities/new" element={<CommunityNewPage />} />
            <Route path="/communities/:slug/manage" element={<CommunityManagePage />} />
          </Route>

          {/* Clean public profile URLs. Static application routes rank above this route. */}
          <Route path="/:handle" element={<PublicAcademicProfilePage />} />

          {/* 404 catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/oauth-callback" element={<OAuthCallbackPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
