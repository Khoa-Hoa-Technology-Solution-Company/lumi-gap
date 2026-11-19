import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/community/data/forum_api.dart';
import 'package:flutter_mobile/features/community/presentation/forum_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// A paged list of discussions for [query], with [header] above it (filters,
/// a community's details). Loads the next page near the end, keeps ids
/// unique across pages, and starts again from page 1 when [query] changes.
class ForumFeedList extends ConsumerStatefulWidget {
  const ForumFeedList({
    required this.query,
    this.header = const [],
    this.bottomPadding = 24,
    super.key,
  });

  final ForumQuery query;
  final List<Widget> header;

  /// Room for a FAB over the end of the list.
  final double bottomPadding;

  @override
  ConsumerState<ForumFeedList> createState() => ForumFeedListState();
}

class ForumFeedListState extends ConsumerState<ForumFeedList> {
  final List<ForumPost> _items = [];
  final Set<String> _ids = {};
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  Object? _error;

  /// Bumped on every reload: an answer for an older query is dropped.
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load(reset: true));
  }

  @override
  void didUpdateWidget(ForumFeedList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.query != widget.query) unawaited(_load(reset: true));
  }

  /// Reloads from the first page (after posting, pull to refresh).
  Future<void> reload() => _load(reset: true);

  Future<void> _load({bool reset = false}) async {
    if (reset) {
      _generation++;
      setState(() {
        _items.clear();
        _ids.clear();
        _page = 0;
        _hasMore = true;
        _error = null;
        _loading = false;
      });
    }
    if (_loading || !_hasMore) return;
    final generation = _generation;
    final next = _page + 1;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ref.read(forumApiProvider).posts(widget.query, next);
      if (!mounted || generation != _generation) return;
      setState(() {
        for (final post in result.items) {
          if (post.id.isNotEmpty && _ids.add(post.id)) _items.add(post);
        }
        _page = next;
        // A short page is the last one, whatever the meta says.
        _hasMore = result.hasMore && result.items.length >= forumPageSize;
      });
    } on Object catch (e) {
      if (mounted && generation == _generation) setState(() => _error = e);
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  /// Opens a discussion; one its author removed leaves the list.
  Future<void> _open(ForumPost post) async {
    final removed = await context.push<bool>(
      '/forum/post/${Uri.encodeComponent(post.publicSlug ?? post.id)}',
    );
    if (removed == true && mounted) await reload();
  }

  bool _onScroll(ScrollNotification n) {
    // Scroll notifications can arrive while a frame is laid out: load after
    // it, never with a setState in the middle of it.
    if (n.metrics.extentAfter <= 600 && _error == null && !_loading && _hasMore) {
      scheduleMicrotask(() {
        if (mounted) unawaited(_load());
      });
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[...widget.header];
    if (_items.isEmpty) {
      if (_error != null) {
        children.add(LumiErrorState(
          message: context.t(isConnectionFailure(_error!)
              ? failureMessageKey(_error!)
              : 'Could not load discussions.'),
          retrying: _loading,
          onRetry: () => unawaited(_load(reset: true)),
        ));
      } else if (_loading || _hasMore) {
        children.add(const LumiSkeleton(rows: 4, height: 96));
      } else {
        children.add(_Empty(query: widget.query));
      }
    } else {
      children.add(LumiRowGroup(
        children: [
          for (final post in _items)
            ForumPostRow(
              post: post,
              onTap: () => unawaited(_open(post)),
            ),
        ],
      ));
      if (_error != null) {
        children.add(Padding(
          padding: const EdgeInsets.only(top: 12),
          child: LumiErrorState(
            inline: true,
            message: context.t('Could not load discussions.'),
            onRetry: () => unawaited(_load()),
          ),
        ));
      } else if (_hasMore) {
        children.add(const Padding(
          padding: EdgeInsets.all(16),
          child: Center(child: CircularProgressIndicator()),
        ));
      }
    }
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(20, 12, 20, widget.bottomPadding),
          children: children,
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.query});
  final ForumQuery query;

  @override
  Widget build(BuildContext context) {
    if (query.topic != null) {
      return LumiEmptyState(
        icon: Icons.forum_outlined,
        message: context.t('No discussions in this community match this topic yet.'),
      );
    }
    final (String title, String message) = query.hasFilters
        ? (
            context.t('No discussions match these filters.'),
            context.t('Try a broader keyword or clear one of the filters.'),
          )
        : query.feed == ForumFeed.following
            ? (
                context.t('No followed discussions yet.'),
                context.t('Follow a discussion to find it here.'),
              )
            : (
                context.t('No discussions yet in this community.'),
                context.t('Start an academic discussion with a question, paper, method, or research gap.'),
              );
    return LumiEmptyState(icon: Icons.forum_outlined, title: title, message: message);
  }
}
