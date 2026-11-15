import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_closure_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class GapsScreen extends ConsumerStatefulWidget {
  const GapsScreen({super.key, this.initialTopic});

  final String? initialTopic;

  @override
  ConsumerState<GapsScreen> createState() => _GapsScreenState();
}

class _GapsScreenState extends ConsumerState<GapsScreen> {
  final topic = TextEditingController();
  final search = TextEditingController();
  String status = 'active';
  double? minConfidence;
  String? activeAnalysisId;
  Timer? pollTimer;
  bool analyzing = false;
  String _sortBy = 'evidence';

  @override
  void initState() {
    super.initState();
    if (widget.initialTopic != null) {
      search.text = widget.initialTopic!;
    }
  }

  @override
  void dispose() {
    topic.dispose();
    search.dispose();
    pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _analyze() async {
    if (topic.text.trim().length < 3) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.t('Topic must be at least 3 characters long.')),
        ),
      );
      return;
    }
    setState(() => analyzing = true);
    try {
      final id = await ref.read(gapsApiProvider).analyze(topic.text.trim());
      setState(() {
        topic.clear();
        activeAnalysisId = id;
      });
      pollTimer?.cancel();
      pollTimer = Timer.periodic(
        const Duration(seconds: 3),
        (_) => ref.invalidate(gapStatusProvider(id)),
      );
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              context.t('Analysis failed to submit: {{error}}', {'error': e.toString().replaceAll('ApiException: ', '')}),
            ),
            backgroundColor: context.lumi.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => analyzing = false);
      }
    }
  }

  Future<void> _handleStatusChange(String id, String newStatus) async {
    try {
      await ref.read(gapsApiProvider).patchStatus(id, newStatus);
      final params = GapsListParams(
        topic: search.text,
        status: status,
        minConfidence: minConfidence,
      );
      ref.invalidate(gapsProvider(params));
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t('Failed to update status: {{e}}', {'e': context.t(failureMessageKey(e))})),
            backgroundColor: context.lumi.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final params = GapsListParams(
      topic: search.text,
      status: status,
      minConfidence: minConfidence,
    );
    final gaps = ref.watch(gapsProvider(params));
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final bgColor = context.lumi.background;
    final cardBg = context.lumi.surface;
    final borderColor = context.lumi.line;
    final inputBg = context.lumi.surface;
    final filterPanelBg = context.lumi.surfaceMuted;
    final textColor = context.lumi.foreground;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        title: Text(context.t('Research Gaps')),
      ),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                context.t('AI Research Gaps'),
                style: context.type.headlineSmall!.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                context.t('Find opportunities and research gaps recommended by Gemini.'),
                style: context.type.bodyMedium!.copyWith(color: context.lumi.muted),
              ),
              const SizedBox(height: 20),

              // Analyze Topic form card
              Container(
                decoration: BoxDecoration(
                  color: cardBg,
                  border: Border.all(color: borderColor),
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.t('ANALYZE NEW RESEARCH TOPIC'),
                      style: context.type.bodySmall!.copyWith(
                        fontWeight: FontWeight.w600,
                        color: context.lumi.muted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            height: 48,
                            decoration: BoxDecoration(
                              color: inputBg,
                              border: Border.all(color: borderColor),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            alignment: Alignment.centerLeft,
                            child: TextField(
                              controller: topic,
                              style: context.type.bodyMedium,
                              decoration: bareInputDecoration(
                                hintText: context.t('Analyze new research topic'),
                                hintStyle: TextStyle(color: context.lumi.foregroundSecondary),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          height: 48,
                          child: ElevatedButton(
                            onPressed: analyzing ? null : _analyze,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: context.lumi.primary,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              elevation: 0,
                            ),
                            child: analyzing
                                ? SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: context.lumi.onPrimary,
                                    ),
                                  )
                                : Text(
                                    context.t('Analyze'),
                                    style: TextStyle(
                                      color: context.lumi.onPrimary,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Custom tab switcher
              Container(
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: borderColor)),
                ),
                child: Row(
                  children: [
                    _TabButton(
                      label: context.t('Active'),
                      active: status == 'active',
                      onTap: () => setState(() => status = 'active'),
                    ),
                    _TabButton(
                      label: context.t('Resolved'),
                      active: status == 'resolved',
                      onTap: () => setState(() => status = 'resolved'),
                    ),
                    _TabButton(
                      label: context.t('Dismissed'),
                      active: status == 'dismissed',
                      onTap: () => setState(() => status = 'dismissed'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Filter panel container
              Container(
                decoration: BoxDecoration(
                  color: filterPanelBg,
                  border: Border.all(color: borderColor.withValues(alpha: 0.5)),
                  borderRadius: BorderRadius.circular(8),
                ),
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Search box
                    Container(
                      height: 40,
                      decoration: BoxDecoration(
                        color: inputBg,
                        border: Border.all(color: borderColor),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Row(
                        children: [
                          Icon(
                            Icons.search,
                            size: 16,
                            color: context.lumi.foregroundSecondary,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              controller: search,
                              onChanged: (_) => setState(() {}),
                              style: context.type.bodySmall,
                              decoration: bareInputDecoration(
                                hintText: context.t('Filter gaps by topic name...'),
                                hintStyle: TextStyle(color: context.lumi.foregroundSecondary),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          context.t('SORT BY'),
                          style: context.type.bodySmall!.copyWith(
                            fontWeight: FontWeight.w600,
                            color: context.lumi.muted,
                          ),
                        ),
                        DropdownButton<String>(
                          value: _sortBy,
                          underline: const SizedBox(),
                          dropdownColor: theme.cardColor,
                          style: context.type.bodySmall!.copyWith(
                            fontWeight: FontWeight.w600,
                            color: context.lumi.primary,
                          ),
                          items: [
                            DropdownMenuItem(
                              value: 'evidence',
                              child: Text(context.t('Evidence-backed')),
                            ),
                            DropdownMenuItem(
                              value: 'confidence',
                              child: Text(context.t('Confidence')),
                            ),
                            DropdownMenuItem(
                              value: 'newest',
                              child: Text(context.t('Newest')),
                            ),
                          ],
                          onChanged: (val) {
                            if (val != null) {
                              setState(() {
                                _sortBy = val;
                              });
                            }
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      context.t('MIN CONFIDENCE'),
                      style: context.type.bodySmall!.copyWith(
                        fontWeight: FontWeight.w600,
                        color: context.lumi.muted,
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Confidence chips
                    Row(
                      children: [
                        _ConfidenceChip(
                          label: context.t('All'),
                          active: minConfidence == null,
                          onTap: () => setState(() => minConfidence = null),
                          inputBg: inputBg,
                          borderColor: borderColor,
                          textColor: textColor,
                        ),
                        const SizedBox(width: 8),
                        _ConfidenceChip(
                          label: context.t('Medium (≥40%)'),
                          active: minConfidence == 0.4,
                          onTap: () => setState(() => minConfidence = 0.4),
                          inputBg: inputBg,
                          borderColor: borderColor,
                          textColor: textColor,
                        ),
                        const SizedBox(width: 8),
                        _ConfidenceChip(
                          label: context.t('High (≥70%)'),
                          active: minConfidence == 0.7,
                          onTap: () => setState(() => minConfidence = 0.7),
                          inputBg: inputBg,
                          borderColor: borderColor,
                          textColor: textColor,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Gaps card list
              gaps.when(
                data: (data) {
                  if (data.data.isEmpty) {
                    return AppEmptyState(
                      icon: Icons.lightbulb_outline,
                      title: context.t('No research gaps found'),
                      message: context.t('Try another filter or submit a topic.'),
                    );
                  }

                  final sortedGaps = [...data.data];
                  if (_sortBy == 'evidence') {
                    sortedGaps.sort(
                      (a, b) => b.evidenceCount.compareTo(a.evidenceCount),
                    );
                  } else if (_sortBy == 'confidence') {
                    sortedGaps.sort(
                      (a, b) => b.confidence.compareTo(a.confidence),
                    );
                  } else if (_sortBy == 'newest') {
                    sortedGaps.sort((a, b) => b.id.compareTo(a.id));
                  }

                  return Column(
                    children: [
                      ...sortedGaps.map(
                        (gap) => GestureDetector(
                          onTap: () => _openGapDetailBottomSheet(gap),
                          child: _GapCard(
                            gap: gap,
                            onStatusChange: _handleStatusChange,
                            isDark: isDark,
                            borderColor: borderColor,
                            textColor: textColor,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        context.plural(data.total, one: '{{count}} research gap found', other: '{{count}} research gaps found'),
                        style: context.type.bodySmall!.copyWith(
                          color: context.lumi.muted,
                        ),
                        textAlign: TextAlign.right,
                      ),
                    ],
                  );
                },
                loading: () => const LumiSkeleton(rows: 3, height: 120),
                error: (error, _) => AppErrorState(message: context.t(failureMessageKey(error))),
              ),
            ],
          ),
          if (activeAnalysisId != null)
            _PollingOverlay(
              id: activeAnalysisId!,
              onClose: () => setState(() => activeAnalysisId = null),
            ),
        ],
      ),
    );
  }

  void _openGapDetailBottomSheet(ResearchGapItem gap) {
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (context) {

          final badgeColor = gap.status == 'resolved'
              ? context.lumi.success
              : gap.status == 'dismissed'
              ? context.lumi.error
              : context.lumi.primary;

          final badgeText = gap.status == 'resolved'
              ? 'VALIDATED'
              : gap.status == 'dismissed'
              ? 'REJECTED'
              : 'PENDING';

          return Container(
            decoration: BoxDecoration(
              color: context.lumi.surface,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(12),
              ),
            ),
            padding: EdgeInsets.only(
              top: 16,
              left: 20,
              right: 20,
              bottom: MediaQuery.of(context).viewInsets.bottom + 24,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: context.lumi.line,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          gap.title,
                          style: context.type.bodyLarge!.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: badgeColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          badgeText,
                          style: context.type.bodySmall!.copyWith(
                            fontWeight: FontWeight.w600,
                            color: badgeColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 24),

                  Text(
                    context.t('Summary Description'),
                    style: context.type.bodyMedium!.copyWith(
                      fontWeight: FontWeight.w600,
                      color: context.lumi.muted,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    gap.description,
                    style: context.type.bodyMedium!.copyWith(height: 1.4),
                  ),
                  const SizedBox(height: 16),

                  Text(
                    context.t('AI Reasoning & Grounding'),
                    style: context.type.bodyMedium!.copyWith(
                      fontWeight: FontWeight.w600,
                      color: context.lumi.muted,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    gap.rationale.isEmpty
                        ? context.t('Gemini identified this gap based on semantic distances in this publication corpus.')
                        : gap.rationale,
                    style: context.type.bodyMedium!.copyWith(
                      fontStyle: FontStyle.italic,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 16),

                  Text(
                    context.t('Validation Metrics'),
                    style: context.type.bodyMedium!.copyWith(
                      fontWeight: FontWeight.w600,
                      color: context.lumi.muted,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _ConfidenceBar(value: gap.confidence),
                      const SizedBox(width: 16),
                      Text(
                        context.t('Evidence Papers: {{evidenceCount}}', {'evidenceCount': gap.evidenceCount}),
                        style: context.type.bodySmall!.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  GapClosureSection(gap: gap),
                  const SizedBox(height: 16),

                  if (gap.supportingPapers.isNotEmpty ||
                      gap.supportingPaperIds.isNotEmpty) ...[
                    Text(
                      context.t('Grounding Evidence Papers'),
                      style: context.type.bodyMedium!.copyWith(
                        fontWeight: FontWeight.w600,
                        color: context.lumi.muted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 120),
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: gap.supportingPapers.isNotEmpty
                            ? gap.supportingPapers.length
                            : gap.supportingPaperIds.length,
                        itemBuilder: (context, idx) {
                          final paper = gap.supportingPapers.isNotEmpty
                              ? gap.supportingPapers[idx]
                              : null;
                          final paperId =
                              paper?.id ?? gap.supportingPaperIds[idx];
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              paper?.title ?? context.t('Supporting evidence paper'),
                              style: context.type.bodySmall!.copyWith(
                                fontWeight: FontWeight.w600,
                                decoration: TextDecoration.underline,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: paper == null
                                ? Text(
                                    context.t('Paper ID: {{paperId}}', {'paperId': paperId}),
                                    style: context.type.bodySmall!.copyWith(
                                      color: context.lumi.muted,
                                    ),
                                  )
                                : Text(
                                    [
                                      if (paper.publicationYear != null)
                                        paper.publicationYear.toString(),
                                      if (paper.journalName != null &&
                                          paper.journalName!.isNotEmpty)
                                        paper.journalName!,
                                      if (paper.citationCount != null)
                                        '${paper.citationCount} cites',
                                    ].join(' - '),
                                    style: context.type.bodySmall!.copyWith(
                                      color: context.lumi.muted,
                                    ),
                                  ),
                            leading: Icon(
                              Icons.article_outlined,
                              size: 18,
                              color: context.lumi.primary,
                            ),
                            onTap: () {
                              Navigator.pop(context);
                              unawaited(context.push('/paper/$paperId'));
                            },
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  const Divider(height: 24),

                  // Grounding CTA Actions
                  Text(
                    context.t('Actions'),
                    style: context.type.bodyMedium!.copyWith(
                      fontWeight: FontWeight.w600,
                      color: context.lumi.muted,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: context.lumi.primary,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          onPressed: () {
                            Navigator.pop(context);
                            unawaited(
                              context.push(
                                '/search?q=${Uri.encodeComponent(gap.topic)}',
                              ),
                            );
                          },
                          icon: Icon(
                            Icons.search,
                            size: 14,
                            color: context.lumi.onPrimary,
                          ),
                          label: Text(
                            context.t('Search Solutions'),
                            style: context.type.bodySmall!.copyWith(
                              color: context.lumi.onPrimary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: context.lumi.primary,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          onPressed: () {
                            Navigator.pop(context);
                            unawaited(
                              showDialog<void>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: Text(context.t('Draft Proposal Outline')),
                                  content: Text(
                                    context.t('Do you want to draft a research proposal outline to address this gap?'),
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () => Navigator.pop(context),
                                      child: Text(context.t('Cancel')),
                                    ),
                                    TextButton(
                                      onPressed: () {
                                        Navigator.pop(context);
                                        unawaited(
                                          context.push(
                                            '/reports?create=true&topic=${Uri.encodeComponent(gap.title)}',
                                          ),
                                        );
                                      },
                                      child: Text(context.t('Draft with AI')),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                          icon: Icon(
                            Icons.edit_note,
                            size: 14,
                            color: context.lumi.onPrimary,
                          ),
                          label: Text(
                            context.t('Draft Proposal'),
                            style: context.type.bodySmall!.copyWith(
                              color: context.lumi.onPrimary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (gap.status == 'active') ...[
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: context.lumi.success,
                              side: BorderSide(color: context.lumi.success),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            onPressed: () {
                              Navigator.pop(context);
                              unawaited(
                                _handleStatusChange(gap.id, 'resolved'),
                              );
                            },
                            icon: const Icon(Icons.check, size: 14),
                            label: Text(
                              context.t('Validate Gap'),
                              style: context.type.bodySmall!.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: context.lumi.error,
                              side: BorderSide(color: context.lumi.error),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            onPressed: () {
                              Navigator.pop(context);
                              unawaited(
                                _handleStatusChange(gap.id, 'dismissed'),
                              );
                            },
                            icon: const Icon(Icons.close, size: 14),
                            label: Text(
                              context.t('Reject Gap'),
                              style: context.type.bodySmall!.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            border: active
                ? Border(
                    bottom: BorderSide(color: context.lumi.primary, width: 2),
                  )
                : null,
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: context.type.bodyMedium!.copyWith(
              fontWeight: FontWeight.w600,
              color: active ? context.lumi.primary : context.lumi.muted,
            ),
          ),
        ),
      ),
    );
  }
}

class _ConfidenceChip extends StatelessWidget {
  const _ConfidenceChip({
    required this.label,
    required this.active,
    required this.onTap,
    required this.inputBg,
    required this.borderColor,
    required this.textColor,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;
  final Color inputBg;
  final Color borderColor;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    final bg = active ? context.lumi.primary : inputBg;
    final borderCol = active ? context.lumi.primary : borderColor;
    final textCol = active ? context.lumi.surface : textColor.withValues(alpha: 0.7);

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(color: borderCol),
            borderRadius: BorderRadius.circular(6),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: context.type.bodySmall!.copyWith(
              fontWeight: FontWeight.w600,
              color: textCol,
            ),
          ),
        ),
      ),
    );
  }
}

class _ConfidenceBar extends StatelessWidget {
  const _ConfidenceBar({required this.value});
  final double value;

  @override
  Widget build(BuildContext context) {
    final pct = (value * 100).round();

    final color = value >= 0.7
        ? context.lumi.success
        : value >= 0.4
        ? context.lumi.warning
        : context.lumi.error;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 80,
          height: 6,
          decoration: BoxDecoration(
            color: context.lumi.line,
            borderRadius: BorderRadius.circular(3),
          ),
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: value.clamp(0.0, 1.0),
            child: Container(
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          context.t('{{pct}}% confidence', {'pct': pct}),
          style: context.type.bodySmall!.copyWith(
            fontWeight: FontWeight.w600,
            color: context.lumi.muted,
          ),
        ),
      ],
    );
  }
}

class _GapCard extends StatelessWidget {
  const _GapCard({
    required this.gap,
    required this.onStatusChange,
    required this.isDark,
    required this.borderColor,
    required this.textColor,
  });

  final ResearchGapItem gap;
  final void Function(String, String) onStatusChange;
  final bool isDark;
  final Color borderColor;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    final statusColor = gap.status == 'resolved'
        ? context.lumi.success
        : gap.status == 'dismissed'
        ? context.lumi.error
        : context.lumi.primary;

    final statusText = gap.status == 'resolved'
        ? context.t('Validated')
        : gap.status == 'dismissed'
        ? context.t('Rejected')
        : context.t('Pending');

    // Mock severity based on confidence
    final severityText = gap.confidence >= 0.7
        ? context.t('High Severity')
        : gap.confidence >= 0.4
        ? context.t('Medium Severity')
        : context.t('Low Severity');

    final severityColor = gap.confidence >= 0.7
        ? context.lumi.error
        : gap.confidence >= 0.4
        ? context.lumi.warning
        : context.lumi.success;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.lumi.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: borderColor),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  gap.title,
                  style: context.type.bodyMedium!.copyWith(
                    fontWeight: FontWeight.w600,
                    height: 1.3,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  statusText,
                  style: context.type.bodySmall!.copyWith(
                    fontWeight: FontWeight.w600,
                    color: statusColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            gap.description,
            style: context.type.bodySmall!.copyWith(
              color: context.lumi.foregroundSecondary,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: GapClosureBadge(gap: gap),
          ),
          const SizedBox(height: 12),

          // Severity & Info row
          Row(
            children: [
              Icon(Icons.warning_amber_rounded, size: 14, color: severityColor),
              const SizedBox(width: 4),
              Text(
                severityText,
                style: context.type.bodySmall!.copyWith(
                  fontWeight: FontWeight.w600,
                  color: severityColor,
                ),
              ),
              const Spacer(),
              Text(
                context.t('Evidence: {{evidenceCount}} papers', {'evidenceCount': gap.evidenceCount}),
                style: context.type.bodySmall!.copyWith(color: context.lumi.muted),
              ),
            ],
          ),
          const SizedBox(height: 12),

          Container(
            padding: const EdgeInsets.only(top: 8),
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: context.lumi.surfaceMuted,
                ),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _ConfidenceBar(value: gap.confidence),
                if (gap.status == 'active')
                  Row(
                    children: [
                      GestureDetector(
                        onTap: () => onStatusChange(gap.id, 'resolved'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: context.lumi.surfaceMuted,
                            border: Border.all(
                              color: context.lumi.surfaceMuted,
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            context.t('Validate'),
                            style: context.type.bodySmall!.copyWith(
                              fontWeight: FontWeight.w600,
                              color: context.lumi.success,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: () => onStatusChange(gap.id, 'dismissed'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: context.lumi.surface,
                            border: Border.all(
                              color: context.lumi.line,
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            context.t('Reject'),
                            style: context.type.bodySmall!.copyWith(
                              fontWeight: FontWeight.w600,
                              color: context.lumi.muted,
                            ),
                          ),
                        ),
                      ),
                    ],
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: context.lumi.surfaceMuted,
                      border: Border.all(color: borderColor),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      gap.status.toUpperCase(),
                      style: context.type.bodySmall!.copyWith(
                        fontWeight: FontWeight.w600,
                        color: context.lumi.muted,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PollingOverlay extends ConsumerWidget {
  const _PollingOverlay({required this.id, required this.onClose});

  final String id;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(gapStatusProvider(id));
    return ColoredBox(
      color: context.lumi.foregroundSecondary,
      child: Center(
        child: Card(
          margin: const EdgeInsets.all(24),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: query.when(
              data: (data) => Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    data.status == 'failed'
                        ? Icons.error_outline
                        : Icons.summarize_outlined,
                    size: 48,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    data.status == 'ready'
                        ? context.t('Analysis complete')
                        : data.status == 'failed'
                        ? context.t('Gap Analysis Failed')
                        : context.t('Analyzing Gaps with AI'),
                  ),
                  if (data.errorMessage != null) Text(data.errorMessage!),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: onClose,
                    child: Text(data.status == 'ready' ? context.t('View gaps') : context.t('Close')),
                  ),
                ],
              ),
              loading: () =>
                  AppLoading(message: context.t('Queueing gap analysis job...')),
              error: (error, _) => Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(context.t(failureMessageKey(error))),
                  TextButton(onPressed: onClose, child: Text(context.t('Dismiss'))),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
