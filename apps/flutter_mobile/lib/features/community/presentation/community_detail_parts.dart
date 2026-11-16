import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/community/data/communities_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Active members (web community-members-tab.tsx), 50 per page, no email.
class CommunityMembersList extends ConsumerStatefulWidget {
  const CommunityMembersList({required this.communityId, super.key});
  final String communityId;

  @override
  ConsumerState<CommunityMembersList> createState() => _CommunityMembersListState();
}

class _CommunityMembersListState extends ConsumerState<CommunityMembersList> {
  final List<CommunityMember> _members = [];
  final Set<String> _ids = {};
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    if (_loading || !_hasMore) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await ref.read(communitiesApiProvider).members(widget.communityId, _page + 1);
      if (!mounted) return;
      setState(() {
        for (final m in page.items) {
          if (_ids.add(m.id)) _members.add(m);
        }
        _page = page.page;
        _hasMore = page.hasMore;
      });
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_members.isEmpty) {
      if (_error != null) {
        return LumiErrorState(
          inline: true,
          message: context.t('Unable to load members.'),
          onRetry: () => unawaited(_load()),
        );
      }
      if (_loading || _hasMore) return const LumiSkeleton(rows: 3, height: 64);
      return LumiEmptyState(icon: Icons.group_outlined, message: context.t('No members yet.'));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LumiRowGroup(
          children: [
            for (final m in _members)
              LumiListRow(
                icon: Icons.person_outline,
                title: m.fullName,
                subtitle: m.institution,
                value: m.role == 'member' ? null : context.t(communityRoleLabel(m.role)),
                showChevron: false,
              ),
          ],
        ),
        if (_error != null)
          LumiErrorState(inline: true, message: context.t('Unable to load members.'), onRetry: () => unawaited(_load()))
        else if (_hasMore)
          TextButton(
            onPressed: _loading ? null : () => unawaited(_load()),
            child: Text(_loading ? context.t('Loading…') : context.t('Load more')),
          ),
      ],
    );
  }
}

/// "Recent discussions summary" for members (web community-discussions-tab):
/// made on request from the last 7 days; while it is being made the status
/// is checked again every few seconds.
class CommunitySummaryCard extends ConsumerStatefulWidget {
  const CommunitySummaryCard({required this.communityId, super.key});
  final String communityId;

  @override
  ConsumerState<CommunitySummaryCard> createState() => _CommunitySummaryCardState();
}

class _CommunitySummaryCardState extends ConsumerState<CommunitySummaryCard> {
  bool _requesting = false;
  Timer? _poll;

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  void _watch(CommunitySummary? summary) {
    if (summary?.status == 'pending') {
      _poll ??= Timer.periodic(const Duration(seconds: 5), (_) {
        if (mounted) ref.invalidate(communitySummaryProvider(widget.communityId));
      });
    } else {
      _poll?.cancel();
      _poll = null;
    }
  }

  Future<void> _request() async {
    if (_requesting) return;
    setState(() => _requesting = true);
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    final locale = context.appLocale;
    try {
      await container.read(communitiesApiProvider).requestSummary(widget.communityId);
    } on Object catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(translate(failureMessageKey(e), locale))));
    } finally {
      container.invalidate(communitySummaryProvider(widget.communityId));
      if (mounted) setState(() => _requesting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: context.lumi.foregroundSecondary);
    final summary = ref.watch(communitySummaryProvider(widget.communityId)).value;
    _watch(summary);
    final pending = summary?.status == 'pending';
    return LumiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(context.t('Recent discussions summary'), style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          if (summary?.status == 'completed' && summary?.summary != null) ...[
            SelectableText(summary!.summary!, style: theme.textTheme.bodyMedium),
            if (summary.sources.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(context.t('Sources'), style: theme.textTheme.labelLarge),
              for (final (n, title, id) in summary.sources)
                TextButton(
                  style: TextButton.styleFrom(alignment: AlignmentDirectional.centerStart),
                  onPressed: () => unawaited(context.push('/forum/post/${Uri.encodeComponent(id)}')),
                  child: Text('[$n] $title', maxLines: 2, overflow: TextOverflow.ellipsis),
                ),
            ],
          ] else if (summary?.status == 'failed')
            Text(context.t('Summary generation failed. Try again later.'), style: secondary)
          else
            Text(context.t('Generated on request from the last 7 days of discussions in this community.'), style: secondary),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _requesting || pending ? null : () => unawaited(_request()),
            child: Text(pending || _requesting
                ? context.t('Summarizing…')
                : context.t('Summarize recent discussions')),
          ),
        ],
      ),
    );
  }
}

/// Topic chips over a community's discussions; tapping the chosen one
/// clears it.
class CommunityTopicChips extends StatelessWidget {
  const CommunityTopicChips({required this.topics, required this.selected, required this.onChanged, super.key});
  final List<String> topics;
  final String? selected;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    if (topics.isEmpty) return const SizedBox.shrink();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final t in topics) ...[
            FilterChip(
              label: Text(t),
              selected: t == selected,
              onSelected: (on) => onChanged(on ? t : null),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

/// "Featured papers" and "Open research gaps" (web community-related-card).
class CommunityRelated extends ConsumerWidget {
  const CommunityRelated({required this.communityId, super.key});
  final String communityId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final related = ref.watch(communityRelatedProvider(communityId));
    final theme = Theme.of(context);
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: context.lumi.foregroundSecondary);
    final value = related.value;
    if (value == null) {
      return related.hasError
          ? LumiErrorState(inline: true, onRetry: () => ref.invalidate(communityRelatedProvider(communityId)))
          : const LumiSkeleton(height: 64);
    }
    final (papers, gaps) = value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LumiSectionHeader(title: context.t('Featured papers')),
        if (papers.isEmpty)
          Text(context.t('No matching papers yet.'), style: secondary)
        else
          LumiRowGroup(
            children: [
              for (final p in papers)
                LumiListRow(
                  icon: Icons.article_outlined,
                  title: p.title,
                  subtitle: [
                    if (p.year != null) '${p.year}',
                    '${p.citations} ${context.t('citations')}',
                  ].join(' · '),
                  onTap: () => unawaited(context.push('/paper/${Uri.encodeComponent(p.id)}')),
                ),
            ],
          ),
        const SizedBox(height: 20),
        LumiSectionHeader(title: context.t('Open research gaps')),
        if (gaps.isEmpty)
          Text(context.t('No shared research gaps yet.'), style: secondary)
        else
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [for (final g in gaps) LumiChip(label: g.title)],
          ),
      ],
    );
  }
}
