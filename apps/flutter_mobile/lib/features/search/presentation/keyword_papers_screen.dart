import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/core/widgets/paper_card.dart';
import 'package:flutter_mobile/features/search/data/search_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class KeywordPapersScreen extends ConsumerWidget {
  const KeywordPapersScreen({required this.keyword, super.key});

  final String keyword;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final decoded = Uri.decodeComponent(keyword);
    final query = ref.watch(searchResultsProvider(SearchParams(q: decoded, pageSize: 30)));
    return Scaffold(
      appBar: AppBar(title: Text(decoded)),
      body: query.when(
        data: (data) {
          if (data.papers.isEmpty) return const AppEmptyState(title: 'No papers found', message: 'Try another keyword.');
          return ListView(
            padding: const EdgeInsets.all(16),
            children: data.papers
                .map(
                  (paper) => PaperCard(
                    id: paper.id,
                    title: paper.title,
                    authors: paper.authors.map((author) => author.displayName).join(', '),
                    venueAndYear: '${paper.publicationYear} - ${paper.citationCount} cites',
                    score: paper.dataQualityScore.toStringAsFixed(2),
                    onTap: () => context.push('/paper/${paper.id}'),
                  ),
                )
                .toList(),
          );
        },
        loading: () => const AppLoading(fullScreen: true, message: 'Loading papers...'),
        error: (error, _) => AppErrorState(message: error.toString()),
      ),
    );
  }
}
