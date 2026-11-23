import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_hero_app_bar.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/community/presentation/communities_list.dart';
import 'package:flutter_mobile/features/community/presentation/forum_feed.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

enum CommunityView { discussions, communities }

/// The Community tab: the web "Research Forum" and "Research Communities"
/// (MainLayout Community group) as two views of one tab.
class CommunityScreen extends ConsumerStatefulWidget {
  const CommunityScreen({this.initialView = CommunityView.discussions, super.key});
  final CommunityView initialView;

  @override
  ConsumerState<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends ConsumerState<CommunityScreen> {
  late CommunityView _view = widget.initialView;
  final _feedKey = GlobalKey<ForumFeedListState>();
  final _search = TextEditingController();
  ForumQuery _query = const ForumQuery();

  @override
  void didUpdateWidget(CommunityScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A link to `/communities` lands on this tab with the other view.
    if (oldWidget.initialView != widget.initialView) _view = widget.initialView;
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _setQuery({ForumFeed? feed, String? search, (String?, String?)? filters}) {
    setState(() {
      _query = ForumQuery(
        feed: feed ?? _query.feed,
        categoryId: filters == null ? _query.categoryId : filters.$1,
        type: filters == null ? _query.type : filters.$2,
        search: search ?? _query.search,
      );
    });
  }

  Future<void> _newDiscussion() async {
    final created = await context.push<ForumPost>('/forum/new');
    if (created == null || !mounted) return;
    unawaited(_feedKey.currentState?.reload());
    unawaited(context.push('/forum/post/${Uri.encodeComponent(created.publicSlug ?? created.id)}'));
  }

  /// Thread type and category, as in the web forum sidebar. Applied when
  /// the sheet closes with "Apply".
  Future<void> _pickFilters() async {
    final picked = await showModalBottomSheet<(String?, String?)>(
      // Over the bottom navigation bar, dimming it too.
      useRootNavigator: true,
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _FilterSheet(categoryId: _query.categoryId, type: _query.type),
    );
    if (picked != null && mounted) _setQuery(filters: picked);
  }

  List<Widget> _feedHeader(BuildContext context) => [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: context.t('Search discussions'),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: context.t('Clear search'),
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            _search.clear();
                            _setQuery(search: '');
                          },
                        ),
                ),
                onChanged: (_) => setState(() {}),
                onSubmitted: (v) => _setQuery(search: v.trim()),
              ),
            ),
            const SizedBox(width: 8),
            LumiFilterButton(
              activeCount: (_query.categoryId == null ? 0 : 1) + (_query.type == null ? 0 : 1),
              onPressed: () => unawaited(_pickFilters()),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final feed in ForumFeed.values) ...[
                ChoiceChip(
                  label: Text(context.t(forumFeedLabel(feed))),
                  selected: _query.feed == feed,
                  onSelected: (_) => _setQuery(feed: feed),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
      ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: LumiHeroAppBar(title: context.t('Community')),
      floatingActionButton: _view == CommunityView.discussions
          ? FloatingActionButton.extended(
              onPressed: () => unawaited(_newDiscussion()),
              icon: const Icon(Icons.edit_outlined),
              label: Text(context.t('New discussion')),
            )
          : null,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: LumiSegmentedTabs<CommunityView>(
                options: [
                  (CommunityView.discussions, context.t('Discussions')),
                  (CommunityView.communities, context.t('Communities')),
                ],
                selected: _view,
                onChanged: (v) => setState(() => _view = v),
              ),
            ),
            Expanded(
              child: IndexedStack(
                index: _view.index,
                children: [
                  ForumFeedList(
                    key: _feedKey,
                    query: _query,
                    header: _feedHeader(context),
                    bottomPadding: 96,
                  ),
                  const CommunitiesList(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterSheet extends ConsumerStatefulWidget {
  const _FilterSheet({required this.categoryId, required this.type});
  final String? categoryId;
  final String? type;

  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  late String _category = widget.categoryId ?? '';
  late String _type = widget.type ?? '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final categories = ref.watch(forumCategoriesProvider).value ?? const <ForumCategory>[];
    Widget title(String text) => Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 4),
          child: Text(text, style: theme.textTheme.titleSmall),
        );
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  title(context.t('Thread type')),
                  RadioGroup<String>(
                    groupValue: _type,
                    onChanged: (v) => setState(() => _type = v ?? ''),
                    child: Column(
                      children: [
                        RadioListTile<String>(value: '', title: Text(context.t('All thread types'))),
                        for (final t in forumPostTypes)
                          RadioListTile<String>(value: t, title: Text(context.t(forumTypeLabel(t)))),
                      ],
                    ),
                  ),
                  title(context.t('Category')),
                  RadioGroup<String>(
                    groupValue: _category,
                    onChanged: (v) => setState(() => _category = v ?? ''),
                    child: Column(
                      children: [
                        RadioListTile<String>(value: '', title: Text(context.t('All categories'))),
                        for (final c in categories) RadioListTile<String>(value: c.id, title: Text(c.name)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() {
                        _type = '';
                        _category = '';
                      }),
                      child: Text(context.t('Clear filters')),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => Navigator.pop(
                        context,
                        (_category.isEmpty ? null : _category, _type.isEmpty ? null : _type),
                      ),
                      child: Text(context.t('Apply')),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
