import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/web_href.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_brand_logo.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/notification_bell.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/home/data/home_api.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_attention_list.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_community_list.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_continue_research.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_recommended_list.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_section_frame.dart';
import 'package:flutter_mobile/features/home/presentation/widgets/home_trend_list.dart';
import 'package:flutter_mobile/features/trends/data/trend_classification.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

String? _roleLabel(AcademicProfileType? type) => switch (type) {
  AcademicProfileType.student => tk('Student'),
  AcademicProfileType.researcher => tk('Researcher'),
  AcademicProfileType.lecturer => tk('Lecturer'),
  null => null,
};

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  /// Papers whose bookmark request is still in flight. A second tap on the
  /// same paper is ignored until the first one has finished; otherwise two
  /// "check then create" sequences could both create a bookmark.
  final Set<String> _bookmarkBusy = {};

  Future<void> _toggleBookmark(String paperId) async {
    if (!_bookmarkBusy.add(paperId)) return;
    // Leaving Home mid-request must still refresh the saved state elsewhere.
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      final api = container.read(bookmarksApiProvider);
      final status = await api.checkStatus('paper', paperId);
      if (status.bookmarked && status.bookmarkId != null) {
        await api.delete(status.bookmarkId!);
      } else {
        await api.create(targetKind: 'paper', targetId: paperId);
      }
    } on Object catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              context.t('Could not update the bookmark. Please try again.'),
            ),
          ),
        );
      }
    } finally {
      _bookmarkBusy.remove(paperId);
      // Re-read the real state whether the request worked or not, so the
      // icon never shows a guess.
      container
        ..invalidate(bookmarksProvider)
        ..invalidate(bookmarkStatusProvider(BookmarkTarget('paper', paperId)));
    }
  }

  /// Pull to refresh: reload both requests independently and keep the
  /// spinner until both are done; say so if either failed.
  Future<void> _refresh() async {
    ref
      ..invalidate(homeOverviewProvider)
      ..invalidate(homeResearchProvider);
    Future<bool> settle(Future<Object?> f) =>
        f.then((_) => true, onError: (Object _) => false);
    final results = await Future.wait([
      settle(ref.read(homeOverviewProvider.future)),
      settle(ref.read(homeResearchProvider.future)),
    ]);
    if (!mounted || !results.contains(false)) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(context.t('Some sections could not be refreshed.'))),
    );
  }

  void _open(String href) => unawaited(openWebHref(context, ref, href));

  /// One section = header + skeleton / error / empty / content. A failed or
  /// `unavailable` section only affects itself.
  Widget _section<A, T>({
    required String title,
    required AsyncValue<A> async,
    required HomeSection<T> Function(A value) pick,
    required VoidCallback retry,
    required bool Function(T data) isEmpty,
    required String emptyText,
    required IconData emptyIcon,
    required Widget Function(T data) builder,
    String? emptyActionLabel,
    VoidCallback? onEmptyAction,
    String? Function(T data)? caption,
    VoidCallback? onAll,
    int skeletonRows = 2,
    double skeletonHeight = 72,
    _Show show = _Show.always,
    bool fullBleed = false,
  }) {
    const gutter = EdgeInsets.symmetric(horizontal: 20);
    final ready = async.hasValue && pick(async.requireValue).isReady;
    final filled =
        ready && !isEmpty(pick(async.requireValue).data as T);
    // Home shows what there is: an optional section with nothing in it takes
    // no room (and "To do" only appears when there is something to do).
    if (show == _Show.whenFilled && !filled) return const SizedBox.shrink();
    if (show == _Show.unlessEmpty && ready && !filled) {
      return const SizedBox.shrink();
    }

    final Widget body;
    String? captionText;
    if (async.hasValue) {
      final section = pick(async.requireValue);
      if (!section.isReady) {
        body = HomeSectionError(onRetry: retry, retrying: async.isLoading);
      } else if (isEmpty(section.data as T)) {
        body = HomeEmptyCard(
          text: emptyText,
          icon: emptyIcon,
          actionLabel: emptyActionLabel,
          onAction: onEmptyAction,
        );
      } else {
        captionText = caption?.call(section.data as T);
        body = builder(section.data as T);
      }
    } else if (async.hasError) {
      body = HomeSectionError(onRetry: retry, retrying: async.isLoading);
    } else {
      body = HomeSkeleton(rows: skeletonRows, height: skeletonHeight);
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: gutter,
            child: HomeSectionHeader(
              title: title,
              onAll: onAll,
              caption: captionText,
            ),
          ),
          // A side-scrolling row runs to the screen edges; its own padding
          // lines its first card up with the titles.
          if (fullBleed && filled)
            body
          else
            Padding(padding: gutter, child: body),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final user = ref.watch(currentUserProvider);
    final overview = ref.watch(homeOverviewProvider);
    final research = ref.watch(homeResearchProvider);

    void retryOverview() => ref.invalidate(homeOverviewProvider);
    void retryResearch() => ref.invalidate(homeResearchProvider);

    final name = research.value?.userName ?? user?.fullName;
    final roleKey = _roleLabel(user?.academicProfileType);

    void go(String path) => unawaited(context.push(path));

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        // The brand on the first screen, as on the web header. The tab label
        // below still says "Home", and screen readers hear "LumiGap".
        title: const LumiBrandLogo(height: 32),
        actions: const [NotificationBell(), SizedBox(width: 4)],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 8, bottom: 24),
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (roleKey != null)
                    Text(
                      context.t(roleKey),
                      style: theme.textTheme.bodyLarge
                          ?.copyWith(color: lumi.foregroundSecondary),
                    ),
                  Text(
                    name == null
                        ? context.t('Hello')
                        : context.t('Hello, {{name}}', {'name': name}),
                    style: theme.textTheme.headlineMedium,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 16),
                  LumiSearchButton(
                    hint: context.t('Search papers, keywords…'),
                    onPressed: () => go('/search'),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 20, 12, 28),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final (icon, label, path) in _shortcuts)
                    Expanded(
                      child: LumiShortcutTile(
                        icon: icon,
                        label: context.t(label),
                        onPressed: () => go(path),
                      ),
                    ),
                ],
              ),
            ),
            _section<HomeResearchOverview, List<HomeAttentionItem>>(
              title: context.t('To do'),
              async: research,
              pick: (o) => o.attentionSection,
              retry: retryResearch,
              isEmpty: (d) => d.isEmpty,
              emptyText: context.t('You have nothing to handle.'),
              emptyIcon: Icons.task_alt,
              show: _Show.whenFilled,
              builder: (items) => HomeAttentionList(
                items: items.take(5).toList(),
                onOpen: _open,
              ),
            ),
            _section<HomeOverview, List<HomeTrendTopic>>(
              title: context.t('Trending topics'),
              async: overview,
              pick: (o) => HomeSection.ready(
                (o.topics.toList()..sort(_byTrend)).take(6).toList(),
              ),
              retry: retryOverview,
              isEmpty: (d) => d.isEmpty,
              emptyText: context.t('No trend data yet.'),
              emptyIcon: Icons.show_chart,
              show: _Show.unlessEmpty,
              fullBleed: true,
              skeletonHeight: 160,
              skeletonRows: 1,
              caption: (topics) => homeTrendsAllInsufficient(topics)
                  ? context.t('Not enough yearly data yet to tell whether these topics are rising or falling.')
                  : null,
              onAll: () => go('/trends'),
              builder: (topics) => HomeTrendingCards(
                topics: topics,
                onOpen: () => go('/trends'),
              ),
            ),
            _section<HomeResearchOverview, List<HomeResearchWorkspace>>(
              title: context.t('Continue your research'),
              async: research,
              pick: (o) => o.continueSection,
              retry: retryResearch,
              isEmpty: (d) => d.isEmpty,
              emptyText: context.t('No projects yet. Create or join a project to get started.'),
              emptyIcon: Icons.folder_open,
              emptyActionLabel: context.t('Go to projects'),
              onEmptyAction: () => context.go('/projects'),
              onAll: () => context.go('/projects'),
              builder: (items) => HomeContinueResearch(
                items: items.take(3).toList(),
                onOpen: _open,
              ),
            ),
            _section<HomeResearchOverview, List<HomeRecommendedPaper>>(
              title: context.t('Suggested papers'),
              async: research,
              pick: (o) => o.recommendations,
              retry: retryResearch,
              isEmpty: (d) => d.isEmpty,
              emptyText: context.t('No suggestions yet. Add topics you are interested in to get suggestions.'),
              emptyIcon: Icons.topic_outlined,
              skeletonHeight: 96,
              builder: (items) => HomeRecommendedList(
                items: items,
                onOpen: (p) => go('/paper/${p.id}'),
                onBookmark: (p) => unawaited(_toggleBookmark(p.id)),
              ),
            ),
            // The newest papers are on Explore, with the other things
            // anyone can browse; Home stays about the user.
            _section<HomeResearchOverview, List<HomeCommunityTopic>>(
              title: context.t('Community activity'),
              async: research,
              pick: (o) => o.communityActivity,
              retry: retryResearch,
              isEmpty: (d) => d.isEmpty,
              emptyText: context.t('No community activity yet.'),
              emptyIcon: Icons.forum_outlined,
              show: _Show.unlessEmpty,
              builder: (items) =>
                  HomeCommunityList(items: items, onOpen: _open),
            ),
          ],
        ),
      ),
    );
  }
}

/// The four entry points under the search box, as on the mockup.
final List<(IconData, String, String)> _shortcuts = [
  // A chart, not an arrow: the arrows mean a verdict (rising, declining).
  (Icons.show_chart, tk('Trends'), '/trends'),
  (Icons.lightbulb_outline, tk('Gaps'), '/gaps'),
  (Icons.description_outlined, tk('Reports'), '/reports'),
  (Icons.emoji_events_outlined, tk('Rankings'), '/rankings'),
];

/// When an optional Home section takes room.
enum _Show {
  /// Loading, error, empty and content alike.
  always,

  /// Not once it is known to be empty.
  unlessEmpty,

  /// Only with something in it (no skeleton, no error of its own).
  whenFilled,
}

int _byTrend(HomeTrendTopic a, HomeTrendTopic b) => compareByTrend(
      (classification: a.classification, totalPapers: a.totalPapers, topic: a.topic),
      (classification: b.classification, totalPapers: b.totalPapers, topic: b.topic),
    );
