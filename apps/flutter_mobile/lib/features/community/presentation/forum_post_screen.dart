import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_action_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_confirm_sheet.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/community/presentation/forum_post_actions.dart';
import 'package:flutter_mobile/features/community/presentation/forum_reply_card.dart';
import 'package:flutter_mobile/features/community/presentation/forum_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Error key for a reply, or null (backend comment schema: 1–10000).
String? replyError(String text) {
  final t = text.trim();
  if (t.isEmpty) return tk('Write a reply first.');
  if (t.length > forumReplyMax) return tk('Use at most 10000 characters.');
  return null;
}

enum _PostAction { share, edit, report, delete }

/// One discussion with its replies, with the actions of the web thread page
/// (forum-detail.tsx). Moderation and revision history stay on the web.
/// Pops `true` when the viewer removed the discussion.
class ForumPostScreen extends ConsumerStatefulWidget {
  const ForumPostScreen({required this.idOrSlug, super.key});
  final String idOrSlug;

  @override
  ConsumerState<ForumPostScreen> createState() => _ForumPostScreenState();
}

class _ForumPostScreenState extends ConsumerState<ForumPostScreen> {
  final List<ForumReply> _replies = [];
  final Set<String> _replyIds = {};
  int _page = 0;
  bool _hasMore = true;
  bool _loadingReplies = false;

  /// Bumped by a refresh: a page that was in flight before it is dropped,
  /// so an old page never lands in the restarted list.
  int _repliesGen = 0;
  Object? _repliesError;
  String? _repliesFor;

  final _reply = TextEditingController();
  final _replyFocus = FocusNode();
  ForumReply? _replyTo;
  bool _sending = false;

  /// One change at a time on the discussion or a reply (accept, edit,
  /// remove, notification level).
  bool _busy = false;
  String? _level;

  /// Accepted reply after the viewer changed it; [_acceptedSet] tells an
  /// explicit "none" from "not changed".
  String? _accepted;
  bool _acceptedSet = false;

  @override
  void dispose() {
    _reply.dispose();
    _replyFocus.dispose();
    super.dispose();
  }

  ForumApi get _api => ref.read(forumApiProvider);

  void _say(String key) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.t(key))));
  }

  Future<void> _loadReplies(String postId) async {
    if (_loadingReplies || !_hasMore) return;
    setState(() {
      _loadingReplies = true;
      _repliesError = null;
    });
    final next = _page + 1;
    final gen = _repliesGen;
    try {
      final page = await _api.replies(postId, next);
      if (!mounted || gen != _repliesGen) return;
      setState(() {
        for (final r in page.items) {
          if (_replyIds.add(r.id)) _replies.add(r);
        }
        _page = next;
        _hasMore = page.hasMore && page.items.length >= forumReplyPageSize;
      });
    } on Object catch (e) {
      if (mounted && gen == _repliesGen) setState(() => _repliesError = e);
    } finally {
      if (mounted && gen == _repliesGen) setState(() => _loadingReplies = false);
    }
  }

  /// Pull to refresh: the discussion again, and its replies from page one.
  Future<void> _refresh() async {
    setState(() {
      _repliesGen++;
      _replies.clear();
      _replyIds.clear();
      _page = 0;
      _hasMore = true;
      _loadingReplies = false;
      _repliesError = null;
      // The next build loads page one again.
      _repliesFor = null;
    });
    try {
      ref.invalidate(forumPostProvider(widget.idOrSlug));
      await ref.read(forumPostProvider(widget.idOrSlug).future);
    } on Object catch (_) {
      // The error state of the screen says what went wrong.
    }
  }

  void _replace(ForumReply updated) {
    final i = _replies.indexWhere((r) => r.id == updated.id);
    if (i >= 0) setState(() => _replies[i] = updated);
  }

  Future<void> _send(ForumPost post) async {
    if (_sending) return;
    final error = replyError(_reply.text);
    if (error != null) return _say(error);
    setState(() => _sending = true);
    // Captured now: after the await this screen may be gone.
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      final created = await container.read(forumApiProvider).reply(
            post.id,
            _reply.text.trim(),
            parentCommentId: _replyTo?.id,
          );
      if (!mounted) return;
      _reply.clear();
      setState(() {
        _replyTo = null;
        // Shown at once when the whole thread is loaded; otherwise it is on
        // a later page and arrives with "Load more replies".
        if (!_hasMore && _replyIds.add(created.id)) _replies.add(created);
      });
      FocusManager.instance.primaryFocus?.unfocus();
      _say(tk('Response posted'));
    } on Object catch (e) {
      final locked = failureStatus(e) == 409;
      _say(locked ? tk('This discussion is locked. Your reply was not posted') : failureMessageKey(e));
      if (locked) container.invalidate(forumPostProvider(widget.idOrSlug));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// Runs one change, locked against a second tap meanwhile.
  Future<void> _run(Future<void> Function() change) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await change();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickLevel(ForumPost post) async {
    final current = _level ?? post.effectiveNotificationLevel;
    final picked = await pickNotificationLevel(context, current);
    if (picked == null || picked == current || !mounted) return;
    await _run(() async {
      try {
        await _api.setNotificationLevel(post.id, picked);
        if (mounted) setState(() => _level = picked);
      } on Object catch (_) {
        _say(tk('Could not update notification settings.'));
      }
    });
  }

  Future<void> _showPostActions(ForumPost post, {required bool isOwner}) async {
    final editable = isOwner && !post.readOnly;
    final action = await showLumiActionSheet<_PostAction>(
      context,
      actions: [
        LumiSheetAction(value: _PostAction.share, label: context.t('Share'), icon: Icons.link),
        if (editable)
          LumiSheetAction(value: _PostAction.edit, label: context.t('Edit discussion'), icon: Icons.edit_outlined),
        LumiSheetAction(value: _PostAction.report, label: context.t('Report content'), icon: Icons.flag_outlined),
        if (editable)
          LumiSheetAction(
            value: _PostAction.delete,
            label: context.t('Delete discussion'),
            icon: Icons.delete_outline,
            destructive: true,
          ),
      ],
    );
    if (action != null && mounted) await _postAction(post, action);
  }

  Future<void> _postAction(ForumPost post, _PostAction action) async {
    switch (action) {
      case _PostAction.share:
        await copyForumLink(context, forumWebPath(post));
      case _PostAction.report:
        await reportForumContent(context, ref, reply: false, id: post.id);
      case _PostAction.edit:
        final updated = await context.push<ForumPost>('/forum/edit', extra: post);
        if (updated != null && mounted) ref.invalidate(forumPostProvider(widget.idOrSlug));
      case _PostAction.delete:
        if (!await confirmForumRemove(context, reply: false) || !mounted) return;
        final router = GoRouter.of(context);
        await _run(() async {
          try {
            await _api.deletePost(post.id);
            _say(tk('Discussion removed'));
            if (router.canPop()) router.pop(true);
          } on Object catch (_) {
            _say(tk('Could not remove this content.'));
          }
        });
    }
  }

  Future<void> _replyAction(ForumPost post, ForumReply reply, ReplyAction action) async {
    switch (action) {
      case ReplyAction.share:
        await copyForumLink(context, forumWebPath(post, postNumber: reply.postNumber));
      case ReplyAction.report:
        await reportForumContent(context, ref, reply: true, id: reply.id);
      case ReplyAction.copy:
        final messenger = ScaffoldMessenger.of(context);
        final locale = context.appLocale;
        await Clipboard.setData(ClipboardData(text: reply.content));
        messenger.showSnackBar(SnackBar(content: Text(translate('Copied to clipboard', locale))));
      case ReplyAction.edit:
        final text = await showLumiInputSheet(
          context,
          title: context.t('Edit response'),
          field: LumiSheetField(
            label: context.t('Response'),
            initial: reply.content,
            maxLength: forumReplyMax,
            minLines: 3,
            maxLines: 8,
            required: true,
          ),
          confirmText: context.t('Save changes'),
        );
        if (text == null || text == reply.content || !mounted) return;
        final error = replyError(text);
        if (error != null) return _say(error);
        await _run(() async {
          try {
            final updated = await _api.updateReply(reply.id, text);
            _replace(updated);
            _say(tk('Response updated'));
          } on Object catch (_) {
            _say(tk('Could not update this response.'));
          }
        });
      case ReplyAction.delete:
        if (!await confirmForumRemove(context, reply: true) || !mounted) return;
        await _run(() async {
          try {
            await _api.deleteReply(reply.id);
            _replace(ForumReply(
              id: reply.id,
              author: reply.author,
              content: '',
              status: 'deleted',
              createdAt: reply.createdAt,
              postNumber: reply.postNumber,
            ));
            // The backend clears an accepted reply that is removed.
            if (_acceptedId(post) == reply.id) {
              setState(() {
                _accepted = null;
                _acceptedSet = true;
              });
            }
            _say(tk('Response removed'));
          } on Object catch (_) {
            _say(tk('Could not remove this content.'));
          }
        });
    }
  }

  String? _acceptedId(ForumPost post) {
    if (_acceptedSet) return _accepted;
    return post.acceptedCommentId ??
        _replies.where((r) => r.isAccepted).map((r) => r.id).firstOrNull;
  }

  Future<void> _toggleAccept(ForumPost post, ForumReply reply) async {
    final next = _acceptedId(post) == reply.id ? null : reply.id;
    await _run(() async {
      try {
        await _api.accept(post.id, next);
        if (mounted) {
          setState(() {
            _accepted = next;
            _acceptedSet = true;
          });
        }
      } on Object catch (_) {
        _say(tk('Could not update accepted response.'));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(forumPostProvider(widget.idOrSlug));
    final post = query.value;
    if (post != null && _repliesFor != post.id) {
      _repliesFor = post.id;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_loadReplies(post.id));
      });
    }
    final isOwner = post != null && ref.watch(currentUserProvider)?.id == post.author.id;
    final level = post == null ? null : _level ?? post.effectiveNotificationLevel;
    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('Discussion')),
        actions: [
          if (post != null && !post.isUnavailable) ...[
            IconButton(
              tooltip: context.t('Discussion notifications'),
              isSelected: level == 'WATCHING' || level == 'TRACKING',
              onPressed: _busy ? null : () => unawaited(_pickLevel(post)),
              icon: Icon(level == 'MUTED' ? Icons.notifications_off_outlined : Icons.notifications_none),
              selectedIcon: const Icon(Icons.notifications_active),
            ),
            IconButton(
              tooltip: context.t('More discussion actions'),
              onPressed: _busy ? null : () => unawaited(_showPostActions(post, isOwner: isOwner)),
              icon: const Icon(Icons.more_vert),
            ),
          ],
        ],
      ),
      body: SafeArea(
        child: switch (query) {
          AsyncValue(:final value?) => _body(context, value, isOwner: isOwner),
          AsyncValue(:final error?) => LumiErrorState(
              message: failureStatus(error) == 404 || failureStatus(error) == 403
                  ? context.t('This post is unavailable.')
                  : context.t(failureMessageKey(error)),
              retrying: query.isLoading,
              onRetry: () => ref.invalidate(forumPostProvider(widget.idOrSlug)),
            ),
          _ => const LumiPageSkeleton(rows: 3, height: 120),
        },
      ),
    );
  }

  Widget _body(BuildContext context, ForumPost post, {required bool isOwner}) {
    if (post.isUnavailable) {
      return LumiEmptyState(icon: Icons.visibility_off_outlined, message: context.t('This post is unavailable.'));
    }
    final theme = Theme.of(context);
    final secondary = theme.textTheme.bodyMedium?.copyWith(color: context.lumi.foregroundSecondary);
    final place = post.researchCommunity?.name ?? post.category?.name;
    final canReply = !post.isLocked && post.canReply;
    final accepted = _acceptedId(post);
    final authors = {for (final r in _replies) r.id: r.author.fullName};
    return Column(
      children: [
        Expanded(
          child: NotificationListener<ScrollNotification>(
            onNotification: (n) {
              // After the frame being laid out, never in the middle of it.
              if (n.metrics.extentAfter <= 400 && _repliesError == null && !_loadingReplies && _hasMore) {
                scheduleMicrotask(() {
                  if (mounted) unawaited(_loadReplies(post.id));
                });
              }
              return false;
            },
            child: RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    LumiChip(label: context.t(forumTypeLabel(post.type)), tone: LumiChipTone.primary),
                    if (post.isPinned) LumiChip(label: context.t('Pinned'), icon: Icons.push_pin_outlined),
                    if (post.isLocked) LumiChip(label: context.t('Locked'), icon: Icons.lock_outline),
                  ],
                ),
                const SizedBox(height: 12),
                SelectableText(post.title, style: theme.textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text(
                  [post.author.fullName, ?place, relativeTime(post.createdAt, context.appLocale)].join(' · '),
                  style: secondary,
                ),
                const SizedBox(height: 16),
                SelectableText(post.content, style: theme.textTheme.bodyLarge),
                if (post.tags.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Wrap(spacing: 8, runSpacing: 6, children: [for (final t in post.tags) LumiChip(label: '#$t')]),
                ],
                const SizedBox(height: 12),
                ForumReactionBar(subjectId: post.id, comment: false, initial: post.reactions, enabled: !post.readOnly),
                if (!canReply) ...[
                  const SizedBox(height: 12),
                  LumiCard(
                    child: Text(
                      post.isLocked
                          ? '${context.t('This discussion is locked.')} ${context.t('Existing responses remain visible, but new replies cannot be added.')}'
                          : context.t('This category is read-only or replying is unavailable.'),
                      style: secondary,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                LumiSectionHeader(title: context.t('Replies')),
                if (_replies.isEmpty && !_loadingReplies && _repliesError == null && !_hasMore)
                  Text(context.t('No replies yet. Start the conversation with a question or a reference.'), style: secondary),
                for (final (i, r) in _replies.indexed) ...[
                  if (i > 0) Divider(height: 1, color: context.lumi.line),
                  ForumReplyCard(
                    reply: r,
                    accepted: r.id == accepted,
                    readOnly: post.readOnly,
                    canReply: canReply,
                    isOwn: ref.watch(currentUserProvider)?.id == r.author.id,
                    canAccept: isOwner && post.type == 'QUESTION',
                    busy: _busy,
                    parentAuthor: r.parentCommentId == null ? null : authors[r.parentCommentId],
                    onReply: () {
                      setState(() => _replyTo = r);
                      _replyFocus.requestFocus();
                    },
                    onAccept: () => unawaited(_toggleAccept(post, r)),
                    onAction: (a) => unawaited(_replyAction(post, r, a)),
                  ),
                ],
                if (_repliesError != null)
                  LumiErrorState(
                    inline: true,
                    message: context.t('Could not load replies.'),
                    onRetry: () => unawaited(_loadReplies(post.id)),
                  )
                else if (_loadingReplies)
                  const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
                else if (_hasMore)
                  TextButton(
                    onPressed: () => unawaited(_loadReplies(post.id)),
                    child: Text(context.t('Load more replies')),
                  ),
              ],
            ),
            ),
          ),
        ),
        if (canReply)
          ReplyComposer(
            controller: _reply,
            focusNode: _replyFocus,
            sending: _sending,
            replyingTo: _replyTo?.author.fullName,
            onCancelReplyTo: () => setState(() => _replyTo = null),
            onSend: () => unawaited(_send(post)),
          ),
      ],
    );
  }
}
