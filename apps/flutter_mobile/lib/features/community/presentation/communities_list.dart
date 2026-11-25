import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/community/data/communities_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The research community directory (web community-list.tsx): search, All /
/// Joined, a sort, and one row per community.
class CommunitiesList extends ConsumerStatefulWidget {
  const CommunitiesList({super.key});

  @override
  ConsumerState<CommunitiesList> createState() => _CommunitiesListState();
}

class _CommunitiesListState extends ConsumerState<CommunitiesList> {
  final _search = TextEditingController();
  CommunityQuery _query = const CommunityQuery();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _set({CommunitySort? sort, bool? joinedOnly, String? search}) => setState(() {
        _query = CommunityQuery(
          sort: sort ?? _query.sort,
          joinedOnly: joinedOnly ?? _query.joinedOnly,
          search: search ?? _query.search,
        );
      });

  Future<void> _pickSort() async {
    final picked = await showModalBottomSheet<CommunitySort>(
      // Over the bottom navigation bar, dimming it too.
      useRootNavigator: true,
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: RadioGroup<CommunitySort>(
          groupValue: _query.sort,
          onChanged: (v) => Navigator.pop(context, v),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final s in CommunitySort.values)
                RadioListTile<CommunitySort>(value: s, title: Text(context.t(communitySortLabel(s)))),
            ],
          ),
        ),
      ),
    );
    if (picked != null && mounted) _set(sort: picked);
  }

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(communitiesProvider(_query));
    final header = <Widget>[
      TextField(
        controller: _search,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          prefixIcon: const Icon(Icons.search),
          hintText: context.t('Search by name, field, or research topic'),
          suffixIcon: _search.text.isEmpty
              ? null
              : IconButton(
                  tooltip: context.t('Clear search'),
                  icon: const Icon(Icons.close),
                  onPressed: () {
                    _search.clear();
                    _set(search: '');
                  },
                ),
        ),
        onChanged: (_) => setState(() {}),
        onSubmitted: (v) => _set(search: v.trim()),
      ),
      const SizedBox(height: 12),
      LumiSegmentedTabs<bool>(
        options: [(false, context.t('All communities')), (true, context.t('Joined'))],
        selected: _query.joinedOnly,
        onChanged: (v) => _set(joinedOnly: v),
      ),
      const SizedBox(height: 8),
      // A short choice: a bottom sheet, like the other filters of the app.
      Align(
        alignment: AlignmentDirectional.centerEnd,
        child: TextButton.icon(
          onPressed: () => unawaited(_pickSort()),
          icon: const Icon(Icons.sort, size: 20),
          label: Text(
            '${context.t('Sort by')}: ${context.t(communitySortLabel(_query.sort))}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
      const SizedBox(height: 4),
    ];

    final Widget content = switch (list) {
      AsyncValue(:final value?) when value.isEmpty => LumiEmptyState(
          icon: Icons.groups_outlined,
          message: _query.joinedOnly
              ? context.t('You have not joined a community yet.')
              : context.t('No communities match your search.'),
        ),
      AsyncValue(:final value?) => LumiRowGroup(
          children: [
            for (final c in value)
              CommunityRow(
                community: c,
                onTap: () => unawaited(context.push('/communities/${Uri.encodeComponent(c.slug)}')),
              ),
          ],
        ),
      AsyncValue(:final error?) => LumiErrorState(
          message: context.t('Unable to load communities. Please try again.'),
          retrying: list.isLoading,
          onRetry: () => ref.invalidate(communitiesProvider(_query)),
          key: ValueKey(error),
        ),
      _ => const LumiSkeleton(rows: 4, height: 88),
    };

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(communitiesProvider(_query));
        try {
          await ref.read(communitiesProvider(_query).future);
        } on Object catch (_) {}
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        children: [...header, content],
      ),
    );
  }
}

class CommunityRow extends StatelessWidget {
  const CommunityRow({required this.community, required this.onTap, super.key});
  final Community community;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final c = community;
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: lumi.foregroundSecondary);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 12, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: lumi.primarySoft, borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.groups_outlined, size: 22, color: lumi.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (c.researchField != null)
                    Text(c.researchField!, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelMedium?.copyWith(color: lumi.primary)),
                  Text(c.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleMedium),
                  Text(
                    c.description ?? context.t('A focused space for researchers working in this field.'),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: secondary,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      if (c.isMember) LumiChip(label: context.t('Joined'), tone: LumiChipTone.success),
                      if (c.isArchived) LumiChip(label: context.t('Archived')),
                      Text(
                        [
                          context.plural(c.memberCount, one: '{{count}} member', other: '{{count}} members'),
                          context.plural(c.threadCount, one: '{{count}} discussion', other: '{{count}} discussions'),
                        ].join(' · '),
                        style: secondary,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, size: 20, color: lumi.muted),
          ],
        ),
      ),
    );
  }
}
