import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail/paper_actions_panel.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail/paper_cited_papers.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail/paper_detail_sections.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail/paper_header_card.dart';
import 'package:flutter_mobile/features/papers/presentation/paper_detail/paper_insights_section.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// One paper: what it is, what to do with it, and what LumiGap knows about
/// it. The sections live in `paper_detail/`; this screen only lays them out.
class PaperDetailScreen extends ConsumerWidget {
  const PaperDetailScreen({
    required this.id,
    this.topic,
    this.query,
    super.key,
  });

  final String id;

  /// Trend topic / search query the reader arrived from (`?topic=` / `?q=`).
  final String? topic;
  final String? query;

  Future<void> _copyLink(BuildContext context, String link) async {
    await Clipboard.setData(ClipboardData(text: link));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(context.t('Paper link copied to clipboard'))),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final paperQuery = ref.watch(paperProvider(id));
    final paper = paperQuery.value;

    final Widget body;
    if (paper != null) {
      final fullText = paper.openAccessUrl;
      body = Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                PaperHeaderCard(paper: paper),
                const SizedBox(height: 12),
                PaperActionsPanel(paper: paper, paperId: id),
                const SizedBox(height: 12),
                PaperAbstractSection(paper: paper),
                const SizedBox(height: 12),
                PaperPublicationDetails(paper: paper),
                const SizedBox(height: 12),
                PaperCitedPapers(paperId: id),
                const SizedBox(height: 12),
                PaperInsightsSection(
                  paper: paper,
                  paperId: id,
                  topic: topic,
                  query: query,
                ),
                const SizedBox(height: 12),
                PaperProjectCta(paperId: id),
              ],
            ),
          ),
          // A bar of its own, not a layer over the list, so it never hides
          // the last section.
          if (fullText != null)
            DecoratedBox(
              decoration: BoxDecoration(
                color: context.lumi.surface,
                border: Border(top: BorderSide(color: context.lumi.line)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () =>
                          unawaited(launchUrl(Uri.parse(fullText))),
                      icon: const Icon(Icons.open_in_new, size: 18),
                      label: Text(context.t('Open full text')),
                    ),
                  ),
                ),
              ),
            ),
        ],
      );
    } else if (paperQuery.hasError) {
      body = LumiErrorState(
        message: context.t(failureMessageKey(paperQuery.error!)),
        retrying: paperQuery.isLoading,
        onRetry: () => ref.invalidate(paperProvider(id)),
      );
    } else {
      body = const LumiPageSkeleton(height: 140);
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('Paper Detail')),
        actions: [
          IconButton(
            tooltip: context.t('Copy link'),
            icon: const Icon(Icons.share_outlined),
            onPressed: () => unawaited(
              _copyLink(
                context,
                paper?.paperLink ??
                    paper?.externalIds.openalexId ??
                    'https://openalex.org/$id',
              ),
            ),
          ),
        ],
      ),
      body: body,
    );
  }
}
