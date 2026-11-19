import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/projects/presentation/add_to_project_sheet.dart';

/// One collapsible section of the paper page: a card with an icon, a title
/// and its content, so every section looks and aligns the same.
class PaperSection extends StatelessWidget {
  const PaperSection({
    required this.icon,
    required this.title,
    required this.child,
    this.initiallyExpanded = true,
    super.key,
  });

  final IconData icon;
  final String title;
  final Widget child;
  final bool initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return LumiCard(
      padding: EdgeInsets.zero,
      child: Theme(
        // No extra divider lines around the open tile: the card has a border.
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: initiallyExpanded,
          tilePadding: const EdgeInsets.symmetric(horizontal: 16),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          leading: Icon(icon, color: lumi.primary, size: 22),
          title: Text(title, style: Theme.of(context).textTheme.titleSmall),
          children: [child],
        ),
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
        title: context.t('Abstract & Description'),
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
      title: context.t('Abstract & Description'),
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
    final rows = <(String, String?)>[
      (context.t('Year'), paper.publicationYear > 0 ? '${paper.publicationYear}' : null),
      (context.t('Type'), text(paper.paperKind)),
      (context.t('Source'), text(paper.journalName)),
      (context.t('Language'), text(paper.language)),
      (context.t('Cited by'), formatNumber(paper.citationCount)),
      // i18n-ignore: metric name
      ('FWCI', paper.fwci?.toStringAsFixed(2)),
      (
        context.t('Related works'),
        paper.relatedWorksCount == null
            ? null
            : formatNumber(paper.relatedWorksCount!),
      ),
      (context.t('Provider'), text(paper.primaryProvider)),
      (context.t('Open Access'), text(paper.openAccessStatus)?.toUpperCase()),
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
            context.t('TAXONOMY SCOPE'),
            style: Theme.of(context)
                .textTheme
                .labelMedium
                ?.copyWith(color: lumi.muted),
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

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 108,
            child: Text(
              label,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: context.lumi.foregroundSecondary),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: SelectableText(
              value,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: context.lumi.foreground),
            ),
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
      title: context.t('Workspace Interactive Chat'),
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
            label: Text(context.t('Add to Project Workspace')),
          ),
        ],
      ),
    );
  }
}
