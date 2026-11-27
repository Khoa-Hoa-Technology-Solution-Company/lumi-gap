import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/projects/presentation/add_to_project_sheet.dart';

/// One section of the paper page: a card with an icon, a title and its
/// content, so every section looks and aligns the same. Always open: a page
/// of collapsible panels reads as a web page, and each panel cost a tap.
class PaperSection extends StatelessWidget {
  const PaperSection({
    required this.icon,
    required this.title,
    required this.child,
    super.key,
  });

  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return LumiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: lumi.primary, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(title, style: Theme.of(context).textTheme.titleSmall),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

/// The abstract, cut to [collapsedLines] until the reader asks for the
/// rest. "Show more" only appears when there really is more.
class PaperAbstractSection extends StatefulWidget {
  const PaperAbstractSection({required this.paper, super.key});

  final Paper paper;

  static const int collapsedLines = 6;

  @override
  State<PaperAbstractSection> createState() => _PaperAbstractSectionState();
}

class _PaperAbstractSectionState extends State<PaperAbstractSection> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final text = widget.paper.abstractText?.trim() ?? '';
    final theme = Theme.of(context);
    final lumi = context.lumi;
    if (text.isEmpty) {
      return PaperSection(
        icon: Icons.subject,
        title: context.t('Abstract & description'),
        child: Text(
          context.t('No abstract description available for this publication.'),
          style: theme.textTheme.bodyLarge?.copyWith(
            color: lumi.foregroundSecondary,
            fontStyle: FontStyle.italic,
          ),
        ),
      );
    }
    final style = theme.textTheme.bodyLarge
        ?.copyWith(height: 1.6, color: lumi.foreground);
    return PaperSection(
      icon: Icons.subject,
      title: context.t('Abstract & description'),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final painter = TextPainter(
            text: TextSpan(text: text, style: style),
            maxLines: PaperAbstractSection.collapsedLines,
            textDirection: Directionality.of(context),
            textScaler: MediaQuery.textScalerOf(context),
          )..layout(maxWidth: constraints.maxWidth);
          final longer = painter.didExceedMaxLines;
          painter.dispose();
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text,
                style: style,
                maxLines: _expanded || !longer
                    ? null
                    : PaperAbstractSection.collapsedLines,
                overflow: _expanded || !longer
                    ? TextOverflow.visible
                    : TextOverflow.ellipsis,
              ),
              if (longer)
                TextButton(
                  onPressed: () => setState(() => _expanded = !_expanded),
                  child: Text(
                    _expanded ? context.t('Show less') : context.t('Show more'),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Source details from OpenAlex, as in the web sidebar. A row is shown only
/// when there is a value: nothing reads "Not available".
class PaperPublicationDetails extends StatelessWidget {
  const PaperPublicationDetails({required this.paper, super.key});

  final Paper paper;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    PaperTopic? topic;
    for (final t in paper.topics) {
      if (t.isPrimary ?? false) {
        topic = t;
        break;
      }
    }
    topic ??= paper.topics.isEmpty ? null : paper.topics.first;

    String? text(String? v) => (v ?? '').trim().isEmpty ? null : v!.trim();
    // As the web work facts: open when there is a free copy or the status
    // is anything but "closed". Unknown status and no copy: no row.
    final oaStatus = text(paper.openAccessStatus)?.toLowerCase();
    final oaUrl = text(paper.openAccessUrl);
    final openAccess = oaUrl != null || (oaStatus != null && oaStatus != 'closed')
        ? context.t('Yes (Open Access)')
        : oaStatus == 'closed'
            ? context.t('No')
            : null;
    final rows = <(String, String?)>[
      (context.t('Year'), paper.publicationYear > 0 ? '${paper.publicationYear}' : null),
      (context.t('Type'), text(paper.paperKind)),
      (context.t('Source'), text(paper.journalName)),
      // Language codes as the web shows them ("EN").
      (context.t('Language'), text(paper.language)?.toUpperCase()),
      (context.t('Cited by'), formatNumber(paper.citationCount)),
      // i18n-ignore: metric name
      ('FWCI', paper.fwci?.toStringAsFixed(2)),
      (
        context.t('Related works'),
        paper.relatedWorksCount == null
            ? null
            : formatNumber(paper.relatedWorksCount!),
      ),
      (context.t('Open access'), openAccess),
      // i18n-ignore: identifier name
      ('DOI', text(paper.externalIds.doi)),
    ];
    final taxonomy = topic == null
        ? const <(String, String?)>[]
        : [
            (context.t('Domain'), text(topic.domainName)),
            (context.t('Field'), text(topic.fieldName)),
            (context.t('Subfield'), text(topic.subfieldName)),
            (context.t('Topic'), text(topic.topicName)),
          ];

    return PaperSection(
      icon: Icons.info_outline,
      title: context.t('Publication details'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (label, value) in rows)
            if (value != null) _MetaRow(label: label, value: value),
          const SizedBox(height: 12),
          Text(
            context.t('Taxonomy scope'),
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 4),
          if (taxonomy.every((r) => r.$2 == null))
            Text(
              context.t('No taxonomy scope metadata found.'),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: lumi.foregroundSecondary,
                    fontStyle: FontStyle.italic,
                  ),
            )
          else
            for (final (label, value) in taxonomy)
              if (value != null) _MetaRow(label: label, value: value),
        ],
      ),
    );
  }
}

/// One detail as on a phone: the label above its value, full width, so a
/// long venue or DOI is never squeezed into a narrow table column.
class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.labelMedium
                ?.copyWith(color: context.lumi.foregroundSecondary),
          ),
          const SizedBox(height: 2),
          SelectableText(
            value,
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: context.lumi.foreground),
          ),
        ],
      ),
    );
  }
}

/// Asking questions about a paper happens in a project, as on the web.
class PaperProjectCta extends StatelessWidget {
  const PaperProjectCta({required this.paperId, super.key});

  final String paperId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return PaperSection(
      icon: Icons.chat_bubble_outline,
      title: context.t('Project chat'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t(
              'Add this paper to a project to ask questions about it, write with it and look for research gaps.',
            ),
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: context.lumi.foregroundSecondary),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => unawaited(
              showAddToProjectSheet(context, paperId: paperId),
            ),
            icon: const Icon(Icons.add, size: 18),
            label: Text(context.t('Add to project workspace')),
          ),
        ],
      ),
    );
  }
}
