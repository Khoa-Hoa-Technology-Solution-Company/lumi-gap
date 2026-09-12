import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/admin/presentation/admin_sync_screen.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/presentation/login_screen.dart';
import 'package:flutter_mobile/features/auth/presentation/register_screen.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/presentation/bookmarks_screen.dart';
import 'package:flutter_mobile/features/gaps/presentation/gaps_screen.dart';
import 'package:flutter_mobile/features/home/presentation/app_shell_screen.dart';
import 'package:flutter_mobile/features/home/presentation/home_screen.dart';
import 'package:flutter_mobile/features/notifications/presentation/notifications_screen.dart';
import 'package:flutter_mobile/features/papers/presentation/my_papers_screen.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail_screen.dart';
import 'package:flutter_mobile/features/papers/presentation/submit_paper_screen.dart';
import 'package:flutter_mobile/features/profile/presentation/profile_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/project_detail_screen.dart';
import 'package:flutter_mobile/features/projects/presentation/projects_screen.dart';
import 'package:flutter_mobile/features/rankings/presentation/rankings_screen.dart';
import 'package:flutter_mobile/features/reports/presentation/report_detail_screen.dart';
import 'package:flutter_mobile/features/reports/presentation/reports_screen.dart';
import 'package:flutter_mobile/features/search/presentation/keyword_papers_screen.dart';
import 'package:flutter_mobile/features/search/presentation/search_screen.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_mobile/features/trends/presentation/trends_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

// Dummy screens for features not yet built
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({required this.title, super.key});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('Screen: $title')),
    );
  }
}

// Global navigator keys
final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorHomeKey = GlobalKey<NavigatorState>(debugLabel: 'homeTab');
final _shellNavigatorBookmarksKey = GlobalKey<NavigatorState>(debugLabel: 'bookmarksTab');
final _shellNavigatorAlertsKey = GlobalKey<NavigatorState>(debugLabel: 'alertsTab');
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
      
      final isGoingToLogin = state.matchedLocation == '/login' || state.matchedLocation == '/register';
      final isSplash = state.matchedLocation == '/splash';
      
      
      if (isLoading && !isGoingToLogin) {
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
        builder: (context, state) => const Scaffold(
          body: AppLoading(fullScreen: true, message: 'Initializing...'),
        ),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
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
            navigatorKey: _shellNavigatorBookmarksKey,
            routes: [
              GoRoute(
                path: '/bookmarks',
                name: 'bookmarks',
                builder: (context, state) => const BookmarksScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _shellNavigatorAlertsKey,
            routes: [
              GoRoute(
                path: '/notifications',
                name: 'notifications',
                builder: (context, state) => const NotificationsScreen(),
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
        builder: (context, state) => PaperDetailScreen(id: state.pathParameters['id'] ?? ''),
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
        path: '/projects',
        name: 'projects',
        builder: (context, state) => const ProjectsScreen(),
      ),
      GoRoute(
        path: '/project/:id',
        name: 'project_detail',
        builder: (context, state) => ProjectDetailScreen(id: state.pathParameters['id'] ?? ''),
      ),
      GoRoute(
        path: '/keyword/:keyword',
        name: 'keyword_detail',
        builder: (context, state) => KeywordPapersScreen(keyword: state.pathParameters['keyword'] ?? ''),
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
