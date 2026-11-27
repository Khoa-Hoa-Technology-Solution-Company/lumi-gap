import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Papers whose bookmark request is in flight, app-wide. A second tap on the
/// same paper (from any list) is ignored until the first one has finished;
/// otherwise two "check then create" sequences could both create a bookmark.
final Set<String> _busy = {};

/// Saves or unsaves a paper from a list row: asks the server for the current
/// state first (the icon may be stale), then creates or deletes. The saved
/// state is re-read afterwards whether it worked or not, so the icon never
/// shows a guess; a failure says so.
Future<void> togglePaperBookmark(BuildContext context, String paperId) async {
  if (!_busy.add(paperId)) return;
  // Leaving the screen mid-request must still refresh the saved state.
  final container = ProviderScope.containerOf(context, listen: false);
  final messenger = ScaffoldMessenger.of(context);
  final locale = context.appLocale;
  try {
    final api = container.read(bookmarksApiProvider);
    final status = await api.checkStatus('paper', paperId);
    if (status.bookmarked && status.bookmarkId != null) {
      await api.delete(status.bookmarkId!);
    } else {
      await api.create(targetKind: 'paper', targetId: paperId);
    }
  } on Object catch (_) {
    if (messenger.mounted) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            translate('Could not update the bookmark. Please try again.', locale),
          ),
        ),
      );
    }
  } finally {
    _busy.remove(paperId);
    container
      ..invalidate(bookmarksProvider)
      ..invalidate(bookmarkStatusProvider(BookmarkTarget('paper', paperId)));
  }
}
