import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/web_href.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/community/data/communities_api.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/community/presentation/community_detail_parts.dart';
import 'package:flutter_mobile/features/community/presentation/forum_feed.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

enum _Tab { discussions, members, about }

/// One research community (web community-detail.tsx): what it is about,
/// joining or leaving it, and its discussions. Managing it stays on the web.
class CommunityDetailScreen extends ConsumerStatefulWidget {
  const CommunityDetailScreen({required this.slug, super.key});
  final String slug;

  @override
  ConsumerState<CommunityDetailScreen> createState() => _CommunityDetailScreenState();
}

class _CommunityDetailScreenState extends ConsumerState<CommunityDetailScreen> {
  _Tab _tab = _Tab.discussions;
  String? _topic;
  bool _busy = false;
  final _feedKey = GlobalKey<ForumFeedListState>();

  /// Membership after my own join/leave, until the community reloads.
  Community? _changed;

  Future<void> _join(Community c) async {
    if (_busy) return;
    setState(() => _busy = true);
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    final locale = context.appLocale;
    try {
      final (role, status) = await container.read(communitiesApiProvider).join(c.id);
      if (mounted) setState(() => _changed = c.withMembership(role, status, memberDelta: 1));
      container.invalidate(communitiesProvider);
    } on Object catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(translate(
          isConnectionFailure(e) ? failureMessageKey(e) : 'Could not join this community.',
          locale,
        )),
      ));
      container.invalidate(communityProvider(widget.slug));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _leave(Community c) async {
    if (_busy) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.t('Leave this community?')),
        content: Text('${c.name} — ${context.t('You will stop being a member. You can join again later.')}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.t('Cancel'))),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: context.lumi.error),
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.t('Leave community')),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    final locale = context.appLocale;
    try {
      await container.read(communitiesApiProvider).leave(c.id);
      if (mounted) setState(() => _changed = c.withMembership(null, null, memberDelta: -1));
      container.invalidate(communitiesProvider);
      messenger.showSnackBar(SnackBar(content: Text(translate('You left the community', locale))));
    } on Object catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(translate(
          isConnectionFailure(e) ? failureMessageKey(e) : 'Could not leave this community.',
          locale,
        )),
      ));
      container.invalidate(communityProvider(widget.slug));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _newDiscussion(Community c) async {
    final created = await context.push<ForumPost>(Uri(
      path: '/forum/new',
      queryParameters: {'communityId': c.id, 'communityName': c.name},
    ).toString());
    if (created == null || !mounted) return;
    // Posting joins the community (backend), so its state changed too.
    ref.invalidate(communityProvider(widget.slug));
    setState(() => _changed = null);
    unawaited(_feedKey.currentState?.reload());
    unawaited(context.push('/forum/post/${Uri.encodeComponent(created.publicSlug ?? created.id)}'));
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(communityProvider(widget.slug));
    ref.listen(communityProvider(widget.slug), (_, next) {
      if (next.hasValue && _changed != null && !_busy) setState(() => _changed = null);
    });
    final community = _changed ?? query.value;
    return Scaffold(
      appBar: AppBar(
        title: Text(community?.name ?? context.t('Community')),
        actions: [
          if (community != null && community.canManage)
            IconButton(
              tooltip: context.t('Manage'),
              onPressed: () => unawaited(openWebPage(context, ref, '/communities/${Uri.encodeComponent(community.slug)}/manage')),
              icon: const Icon(Icons.settings_outlined),
            ),
        ],
      ),
      floatingActionButton: community != null &&
              _tab == _Tab.discussions &&
              community.status == 'ACTIVE' &&
              !community.isBanned
          ? FloatingActionButton.extended(
              onPressed: () => unawaited(_newDiscussion(community)),
              icon: const Icon(Icons.edit_outlined),
              label: Text(context.t('New discussion')),
            )
          : null,
      body: SafeArea(
        child: community != null
            ? _body(context, community)
            : query.hasError
                ? LumiEmptyState(
                    icon: Icons.groups_outlined,
                    title: context.t('Community unavailable'),
                    message: context.t('This community may not exist or may no longer be available.'),
                    actionLabel: context.t('Browse communities'),
                    onAction: () => context.go('/community?view=communities'),
                  )
                : const LumiPageSkeleton(rows: 3, height: 120),
      ),
    );
  }

  Widget _body(BuildContext context, Community c) {
    final header = <Widget>[
      _Header(community: c, busy: _busy, onJoin: () => unawaited(_join(c)), onLeave: () => unawaited(_leave(c))),
      const SizedBox(height: 16),
      LumiSegmentedTabs<_Tab>(
        options: [
          (_Tab.discussions, context.t('Discussions')),
          (_Tab.members, context.t('Members')),
          (_Tab.about, context.t('About')),
        ],
        selected: _tab,
        onChanged: (t) => setState(() => _tab = t),
      ),
      const SizedBox(height: 12),
    ];
    if (_tab != _Tab.discussions) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        children: [
          ...header,
          if (_tab == _Tab.members)
            CommunityMembersList(key: ValueKey(c.id), communityId: c.id)
          else ...[
            _About(community: c),
            const SizedBox(height: 20),
            CommunityRelated(communityId: c.id),
          ],
        ],
      );
    }
    return ForumFeedList(
      key: _feedKey,
      query: ForumQuery(researchCommunityId: c.id, topic: _topic),
      header: [
        ...header,
        if (c.canSummarize) ...[
          CommunitySummaryCard(communityId: c.id),
          const SizedBox(height: 12),
        ],
        CommunityTopicChips(
          topics: c.researchTopics,
          selected: _topic,
          onChanged: (t) => setState(() => _topic = t),
        ),
        if (c.researchTopics.isNotEmpty) const SizedBox(height: 12),
      ],
      bottomPadding: 96,
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.community, required this.busy, required this.onJoin, required this.onLeave});
  final Community community;
  final bool busy;
  final VoidCallback onJoin;
  final VoidCallback onLeave;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final c = community;
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: lumi.foregroundSecondary);
    Widget? action;
    if (c.isMember && c.isOwner) {
      action = OutlinedButton(
        onPressed: () => unawaited(openWebPage(
          context,
          ref,
          '/communities/${Uri.encodeComponent(c.slug)}/manage?tab=settings',
        )),
        child: Text(context.t('Transfer ownership to leave')),
      );
    } else if (c.isMember) {
      action = OutlinedButton.icon(
        onPressed: busy ? null : onLeave,
        icon: const Icon(Icons.check),
        label: Text('${context.t('Joined')} · ${context.t('Leave community')}'),
      );
    } else if (c.canJoin) {
      action = FilledButton(
        onPressed: busy ? null : onJoin,
        child: Text(busy ? context.t('Joining…') : context.t('Join community')),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (c.isArchived) LumiChip(label: context.t('Archived')),
            if (c.status == 'PENDING_APPROVAL') LumiChip(label: context.t('Pending approval'), tone: LumiChipTone.warning),
            if (c.status == 'REJECTED') LumiChip(label: context.t('Rejected'), tone: LumiChipTone.error),
            if (c.researchField != null)
              Text(c.researchField!, style: theme.textTheme.labelMedium?.copyWith(color: lumi.primary)),
          ],
        ),
        const SizedBox(height: 8),
        Text(c.name, style: theme.textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text(
          c.description ?? context.t('A focused academic community for exchanging evidence, questions and research practice.'),
          style: secondary,
        ),
        const SizedBox(height: 8),
        Text(
          [
            context.plural(c.memberCount, one: '{{count}} member', other: '{{count}} members'),
            context.plural(c.threadCount, one: '{{count}} discussion', other: '{{count}} discussions'),
          ].join(' · '),
          style: secondary,
        ),
        if (c.isArchived) ...[
          const SizedBox(height: 12),
          LumiCard(child: Text(context.t('This community is archived. Content is read-only and it no longer accepts members.'), style: secondary)),
        ],
        if (action != null) ...[
          const SizedBox(height: 12),
          SizedBox(width: double.infinity, child: action),
        ],
      ],
    );
  }
}

class _About extends StatelessWidget {
  const _About({required this.community});
  final Community community;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final c = community;
    final rules = c.rules.isEmpty
        ? [context.t('Follow respectful academic discussion and cite evidence where possible.')]
        : c.rules;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LumiSectionHeader(title: context.t('About this community')),
        LumiCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (c.researchTopics.isNotEmpty) ...[
                Text(context.t('Research topics'), style: theme.textTheme.titleSmall),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 6, children: [for (final t in c.researchTopics) LumiChip(label: t)]),
                const SizedBox(height: 16),
              ],
              Text(context.t('Community rules'), style: theme.textTheme.titleSmall),
              const SizedBox(height: 4),
              for (final (i, rule) in rules.indexed)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('${i + 1}. $rule', style: theme.textTheme.bodyMedium),
                ),
              if (c.moderators.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(context.t('Moderators'), style: theme.textTheme.titleSmall),
                const SizedBox(height: 4),
                Text(c.moderators.join(', '), style: theme.textTheme.bodyMedium),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
