import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/admin/presentation/admin_sync_screen.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/presentation/auth_startup_screen.dart';
import 'package:flutter_mobile/features/auth/presentation/forgot_password_screen.dart';
import 'package:flutter_mobile/features/auth/presentation/login_screen.dart';
import 'package:flutter_mobile/features/auth/presentation/register_screen.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/presentation/bookmarks_screen.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/community/presentation/community_detail_screen.dart';
import 'package:flutter_mobile/features/community/presentation/community_screen.dart';
import 'package:flutter_mobile/features/community/presentation/forum_post_screen.dart';
import 'package:flutter_mobile/features/community/presentation/new_post_screen.dart';
import 'package:flutter_mobile/features/explore/presentation/explore_screen.dart';
import 'package:flutter_mobile/features/gaps/presentation/gaps_screen.dart';
import 'package:flutter_mobile/features/home/presentation/app_shell_screen.dart';
import 'package:flutter_mobile/features/home/presentation/home_screen.dart';
import 'package:flutter_mobile/features/notifications/presentation/notifications_screen.dart';
import 'package:flutter_mobile/features/papers/presentation/my_papers_screen.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail_screen.dart';
import 'package:flutter_mobile/features/papers/presentation/submit_paper_screen.dart';
import 'package:flutter_mobile/features/profile/presentation/account_screen.dart';
import 'package:flutter_mobile/features/profile/presentation/profile_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/invitation_link_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/projects_screen.dart';
import 'package:flutter_mobile/features/rankings/presentation/rankings_screen.dart';
import 'package:flutter_mobile/features/reports/presentation/report_detail_screen.dart';
import 'package:flutter_mobile/features/reports/presentation/reports_screen.dart';
import 'package:flutter_mobile/features/reviews/presentation/review_center_screen.dart';
import 'package:flutter_mobile/features/reviews/presentation/review_request_screen.dart';
import 'package:flutter_mobile/features/search/presentation/search_screen.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_mobile/features/trends/presentation/trends_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

// Global navigator keys
final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorHomeKey = GlobalKey<NavigatorState>(debugLabel: 'homeTab');
final _shellNavigatorExploreKey = GlobalKey<NavigatorState>(debugLabel: 'exploreTab');
final _shellNavigatorProjectsKey = GlobalKey<NavigatorState>(debugLabel: 'projectsTab');
final _shellNavigatorCommunityKey = GlobalKey<NavigatorState>(debugLabel: 'communityTab');
final _shellNavigatorProfileKey = GlobalKey<NavigatorState>(debugLabel: 'profileTab');

class RouterNotifier extends ChangeNotifier {
  RouterNotifier(this._ref) {
    _ref.listen<AsyncValue<User?>>(
      authControllerProvider,
      (_, _) => notifyListeners(),
    );
  }
  final Ref _ref;
}

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = RouterNotifier(ref);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/',
    refreshListenable: notifier,
    redirect: (context, state) {
      final authState = ref.read(authControllerProvider);
      final isLoading = authState.isLoading;
      final user = authState.value;
      
      final isGoingToLogin = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register' ||
          state.matchedLocation == '/forgot-password';
      final isSplash = state.matchedLocation == '/splash';
      
      
      // Checking the session, or the check could not reach the server (the
      // session is kept): the start screen, which offers a retry.
      if ((isLoading || authState.hasError) && !isGoingToLogin) {
        return '/splash';
      }
      
      if (!isLoading && user == null && !isGoingToLogin) {
        return '/login';
      }
      
      
      if (user != null && (isGoingToLogin || isSplash)) {
        return '/';
      }
      
      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const AuthStartupScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => LoginScreen(
          initialEmail: state.uri.queryParameters['email'] ?? '',
        ),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => ForgotPasswordScreen(
          initialEmail: state.uri.queryParameters['email'] ?? '',
        ),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => RegisterScreen(
          initialEmail: state.uri.queryParameters['email'] ?? '',
        ),
      ),

      // StatefulShellRoute for Bottom Navigation Tabs
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return AppShellScreen(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            navigatorKey: _shellNavigatorHomeKey,
            routes: [
              GoRoute(
                path: '/',
                name: 'home',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _shellNavigatorExploreKey,
            routes: [
              GoRoute(
                path: '/explore',
                name: 'explore',
                builder: (context, state) => const ExploreScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _shellNavigatorProjectsKey,
            routes: [
              GoRoute(
                path: '/projects',
                name: 'projects',
                builder: (context, state) => const ProjectsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _shellNavigatorCommunityKey,
            routes: [
              GoRoute(
                path: '/community',
                name: 'community',
                builder: (context, state) => CommunityScreen(
                  initialView: state.uri.queryParameters['view'] == 'communities'
                      ? CommunityView.communities
                      : CommunityView.discussions,
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _shellNavigatorProfileKey,
            routes: [
              GoRoute(
                path: '/profile',
                name: 'profile',
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),

      // Other routes outside the shell
      GoRoute(
        path: '/paper/:id',
        name: 'paper_detail',
        builder: (context, state) => PaperDetailScreen(
          id: state.pathParameters['id'] ?? '',
          topic: state.uri.queryParameters['topic'],
          query: state.uri.queryParameters['q'],
        ),
      ),
      GoRoute(
        path: '/trends',
        name: 'trends',
        builder: (context, state) => const TrendsScreen(),
      ),
      GoRoute(
        path: '/reports',
        name: 'reports',
        builder: (context, state) {
          final params = state.uri.queryParameters;
          return ReportsScreen(
            initialProjectId: params['projectId'],
            initialTopic: params['topic'],
            initialQuery: params['query'],
            initialYearFrom: int.tryParse(params['yearFrom'] ?? ''),
            initialYearTo: int.tryParse(params['yearTo'] ?? ''),
            initialScopeFilters: TrendScopeFilters.fromQuery(params),
            // A link that asks for a report (or brings its subject) opens
            // the steps; the plain screen opens on the list.
            startBuilding: params['create'] == 'true' ||
                (params['topic'] ?? '').trim().isNotEmpty ||
                (params['query'] ?? '').trim().isNotEmpty,
          );
        },
      ),
      GoRoute(
        path: '/report/:id',
        name: 'report_detail',
        builder: (context, state) => ReportDetailScreen(id: state.pathParameters['id'] ?? ''),
      ),
      GoRoute(
        path: '/submit-paper',
        name: 'submit_paper',
        builder: (context, state) => SubmitPaperScreen(editId: state.uri.queryParameters['editId']),
      ),
      GoRoute(
        path: '/account',
        name: 'account',
        builder: (context, state) => const AccountScreen(),
      ),
      GoRoute(
        path: '/my-papers',
        name: 'my_papers',
        builder: (context, state) => const MyPapersScreen(),
      ),
      GoRoute(
        path: '/rankings',
        name: 'rankings',
        builder: (context, state) => const RankingsScreen(),
      ),
      GoRoute(
        path: '/gaps',
        name: 'gaps',
        builder: (context, state) {
          final topic = state.uri.queryParameters['topic'];
          return GapsScreen(initialTopic: topic);
        },
      ),
      GoRoute(
        path: '/bookmarks',
        name: 'bookmarks',
        builder: (context, state) => const BookmarksScreen(),
      ),
      GoRoute(
        path: '/forum/new',
        name: 'forum_new',
        builder: (context, state) => NewPostScreen(
          communityId: state.uri.queryParameters['communityId'],
          communityName: state.uri.queryParameters['communityName'],
        ),
      ),
      GoRoute(
        path: '/forum/edit',
        name: 'forum_edit',
        // Opened from the discussion with the post as `extra`; a cold link
        // has nothing to edit and goes back to the forum.
        redirect: (context, state) => state.extra is ForumPost ? null : '/community',
        builder: (context, state) => NewPostScreen(editing: state.extra! as ForumPost),
      ),
      GoRoute(
        path: '/forum/post/:id',
        name: 'forum_post',
        builder: (context, state) => ForumPostScreen(idOrSlug: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/communities/:slug',
        name: 'community_detail',
        builder: (context, state) => CommunityDetailScreen(slug: state.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/reviews',
        name: 'review_center',
        builder: (context, state) => const ReviewCenterScreen(),
      ),
      GoRoute(
        path: '/review-requests/:id',
        name: 'review_request',
        builder: (context, state) => ReviewRequestScreen(id: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/invitations/:token',
        name: 'invitation_link',
        builder: (context, state) => InvitationLinkScreen(token: state.pathParameters['token']!),
      ),
      GoRoute(
        path: '/notifications',
        name: 'notifications',
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/project/:id',
        name: 'project_detail',
        builder: (context, state) => ProjectDetailScreen(id: state.pathParameters['id'] ?? ''),
      ),
      GoRoute(
        path: '/keyword/:keyword',
        name: 'keyword_detail',
        // Kept for old links: a keyword's papers are a search for it, so
        // they open Search instead of a second, poorer copy of it.
        redirect: (context, state) => Uri(
          path: '/search',
          queryParameters: {'q': state.pathParameters['keyword'] ?? ''},
        ).toString(),
      ),
      GoRoute(
        path: '/search',
        name: 'search',
        builder: (context, state) {
          final q = state.uri.queryParameters['q'] ?? '';
          return SearchScreen(
            initialQuery: q,
            initialFilters: state.uri.queryParameters,
          );
        },
      ),
      GoRoute(
        path: '/admin/sync',
        name: 'admin_sync',
        builder: (context, state) => const AdminSyncScreen(),
      ),
    ],
  );
});
