import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/router/app_router.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/notifications/data/notifications_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/search/data/search_api.dart';
import 'package:flutter_mobile/features/search/presentation/search_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'auth_test_support.dart';

class _FakeSearchApi extends Fake implements SearchApi {
  final List<String> queries = [];

  @override
  Future<PagedPapers> semantic(SearchParams params) async {
    queries.add(params.q);
    return const PagedPapers(papers: []);
  }
}

void main() {
  testWidgets('an old keyword link opens Search for that keyword',
      (tester) async {
    final search = _FakeSearchApi();
    late GoRouter router;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authControllerProvider.overrideWith(
            () => FakeAuthController(testUser()),
          ),
          searchApiProvider.overrideWithValue(search),
          bookmarksProvider.overrideWith((ref) async => const <Bookmark>[]),
          notificationsProvider.overrideWith(
            (ref) async => const <AppNotification>[],
          ),
          homeOverviewProvider.overrideWith(
            (ref) async => HomeOverview.fromJson(const {}),
          ),
          homeResearchProvider.overrideWith(
            (ref) async => HomeResearchOverview.fromJson(const {}),
          ),
        ],
        child: Consumer(
          builder: (context, ref, _) {
            router = ref.watch(routerProvider);
            return MaterialApp.router(
              locale: AppLocale.en.locale,
              supportedLocales: AppLocale.supportedLocales,
              localizationsDelegates: appLocalizationsDelegates,
              theme: AppTheme.lightTheme,
              routerConfig: router,
            );
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    router.go('/keyword/federated%20learning');
    await tester.pumpAndSettle();

    expect(find.byType(SearchScreen), findsOneWidget);
    expect(search.queries, contains('federated learning'));
  });
}
