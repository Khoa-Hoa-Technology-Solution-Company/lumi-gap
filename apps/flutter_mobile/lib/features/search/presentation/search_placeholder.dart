import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';

/// What the results area shows while it has no paper: the first page
/// loading, why it failed (with a retry), the prompt before any search, or
/// "No search results" only when a search really returned nothing.
class SearchPlaceholder extends StatelessWidget {
  const SearchPlaceholder({
    required this.loading,
    required this.error,
    required this.searched,
    required this.onRetry,
    super.key,
  });

  final bool loading;
  final Object? error;
  final bool searched;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      // Clipped, not scrollable: on a short screen the last placeholder is
      // simply cut off.
      return const SingleChildScrollView(
        physics: NeverScrollableScrollPhysics(),
        padding: EdgeInsets.all(16),
        child: LumiSkeleton(rows: 4, height: 132),
      );
    }
    final failure = error;
    if (failure != null) {
      return LumiErrorState(
        message: context.t(failureMessageKey(failure)),
        onRetry: onRetry,
      );
    }
    return SingleChildScrollView(
      child: searched
          ? LumiEmptyState(
              icon: Icons.search_off_outlined,
              title: context.t('No search results'),
              message: context.t('Try other words or remove some filters.'),
            )
          : LumiEmptyState(
              icon: Icons.search,
              title: context.t('Search papers'),
              message: context.t('Search by title, keyword or author.'),
            ),
    );
  }
}
