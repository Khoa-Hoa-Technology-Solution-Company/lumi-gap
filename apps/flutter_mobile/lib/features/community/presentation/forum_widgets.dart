import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// One discussion in a feed: type, title, where and who, and how lively it
/// is (replies, Helpful, last activity), as the web topic list shows it.
class ForumPostRow extends StatelessWidget {
  const ForumPostRow({required this.post, required this.onTap, super.key});
  final ForumPost post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: lumi.foregroundSecondary);
    final place = post.researchCommunity?.name ?? post.category?.name;
    final when = post.lastActivityAt ?? post.createdAt;
    final stats = [
      context.plural(post.replyCount, one: '{{count}} reply', other: '{{count}} replies'),
      if (post.helpfulCount > 0) '${context.t('Helpful')} ${post.helpfulCount}',
      relativeTime(when, context.appLocale),
    ].join(' · ');
    // Full width: the row group centres a narrower child, which shifted rows
    // with a short title away from the left edge.
    return InkWell(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 12, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                LumiChip(label: context.t(forumTypeLabel(post.type)), tone: LumiChipTone.primary),
                if (post.isPinned) LumiChip(label: context.t('Pinned'), icon: Icons.push_pin_outlined),
                if (post.isLocked) LumiChip(label: context.t('Locked'), icon: Icons.lock_outline),
              ],
            ),
            const SizedBox(height: 8),
            Text(post.title, maxLines: 3, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              [post.author.fullName, ?place].join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: secondary,
            ),
            Text(stats, style: secondary),
          ],
        ),
      ),
    );
  }
}

/// Reactions of a post or reply: one chip per reaction someone gave (mine
/// highlighted), and a button to add one. Counts always come back from the
/// server; nothing is counted on the phone.
class ForumReactionBar extends ConsumerStatefulWidget {
  const ForumReactionBar({
    required this.subjectId,
    required this.comment,
    required this.initial,
    this.enabled = true,
    super.key,
  });

  final String subjectId;
  final bool comment;
  final ReactionState initial;

  /// False on a locked or unavailable discussion.
  final bool enabled;

  @override
  ConsumerState<ForumReactionBar> createState() => _ForumReactionBarState();
}

class _ForumReactionBarState extends ConsumerState<ForumReactionBar> {
  late ReactionState _state = widget.initial;
  bool _busy = false;

  @override
  void didUpdateWidget(ForumReactionBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.initial, widget.initial) && !_busy) _state = widget.initial;
  }

  Future<void> _toggle(String reaction) async {
    if (_busy || !widget.enabled) return;
    setState(() => _busy = true);
    final api = ref.read(forumApiProvider);
    final messenger = ScaffoldMessenger.of(context);
    final locale = context.appLocale;
    try {
      final next = await api.react(
        comment: widget.comment,
        id: widget.subjectId,
        reaction: reaction,
        active: !_state.mine.contains(reaction),
      );
      if (mounted) setState(() => _state = next);
    } on Object catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(translate(
          isConnectionFailure(e) ? failureMessageKey(e) : 'Could not update reaction.',
          locale,
        )),
      ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pick() async {
    final picked = await showModalBottomSheet<String>(
      // Over the bottom navigation bar, dimming it too.
      useRootNavigator: true,
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (name, emoji, label) in forumReactions)
                FilterChip(
                  label: Text('$emoji ${context.t(label)}'),
                  selected: _state.mine.contains(name),
                  onSelected: (_) => Navigator.pop(context, name),
                ),
            ],
          ),
        ),
      ),
    );
    if (picked != null) await _toggle(picked);
  }

  @override
  Widget build(BuildContext context) {
    final given = [
      for (final r in forumReactions)
        if ((_state.counts[r.$1] ?? 0) > 0) r,
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final (name, emoji, label) in given)
          FilterChip(
            label: Text('$emoji ${_state.counts[name]}'),
            tooltip: context.t(label),
            selected: _state.mine.contains(name),
            showCheckmark: false,
            onSelected: widget.enabled && !_busy ? (_) => unawaited(_toggle(name)) : null,
          ),
        if (widget.enabled)
          IconButton(
            tooltip: context.t('Add reaction'),
            onPressed: _busy ? null : () => unawaited(_pick()),
            icon: const Icon(Icons.add_reaction_outlined),
          ),
      ],
    );
  }
}
