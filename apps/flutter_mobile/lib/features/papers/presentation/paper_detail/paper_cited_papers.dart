import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail/paper_detail_sections.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Works this paper cites that are also in the LumiGap library, as in the
/// web's "cited papers" block. Closed at first: the list is only requested
/// when the reader opens it.
class PaperCitedPapers extends StatelessWidget {
  const PaperCitedPapers({required this.paperId, super.key});

  final String paperId;

  @override
  Widget build(BuildContext context) => PaperSection(
        icon: Icons.format_list_bulleted,
        title: context.t('Cited papers in LumiGap'),
        initiallyExpanded: false,
        child: _CitedList(paperId: paperId),
      );
}

class _CitedList extends ConsumerWidget {
  const _CitedList({required this.paperId});

  final String paperId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(paperReferencesProvider(paperId));
    final theme = Theme.of(context);
    final lumi = context.lumi;

    if (query.hasError && !query.hasValue) {
      return LumiErrorState(
        message: context.t(failureMessageKey(query.error!)),
        retrying: query.isLoading,
        onRetry: () => ref.invalidate(paperReferencesProvider(paperId)),
        inline: true,
      );
    }
    if (!query.hasValue) return const LumiSkeleton(rows: 3, height: 64);

    final data = query.requireValue;
    if (data.references.isEmpty) {
      return Text(
        context.t('No in-library references found yet.'),
        style: theme.textTheme.bodyMedium
            ?.copyWith(color: lumi.foregroundSecondary),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          context.t(
            'Showing {{inCorpus}} of {{totalReferenced}} cited works found in this library.',
            {
              'inCorpus': data.inCorpus,
              'totalReferenced': data.totalReferenced,
            },
          ),
          style: theme.textTheme.bodySmall
              ?.copyWith(color: lumi.foregroundSecondary),
        ),
        const SizedBox(height: 8),
        for (final reference in data.references)
          InkWell(
            onTap: () => unawaited(context.push('/paper/${reference.id}')),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    reference.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    [
                      ...reference.authors.take(3).map((a) => a.displayName),
                      if (reference.publicationYear > 0)
                        '${reference.publicationYear}',
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: lumi.foregroundSecondary),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
