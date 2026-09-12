import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
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
        const SnackBar(
          content: Text('Topic must be at least 3 characters long.'),
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
              'Analysis failed to submit: ${e.toString().replaceAll('ApiException: ', '')}',
            ),
            backgroundColor: Colors.red,
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
            content: Text('Failed to update status: $e'),
            backgroundColor: Colors.red,
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

    final bgColor = isDark
        ? const Color(0xFF0F1B2D)
        : theme.scaffoldBackgroundColor;
    final cardBg = isDark ? const Color(0xFF1A2332) : theme.cardColor;
    final borderColor = isDark
        ? const Color(0xFF26334A)
        : const Color(0xFFE2E8F0);
    final inputBg = isDark ? const Color(0xFF0F1B2D) : Colors.white;
    final filterPanelBg = isDark
        ? const Color(0xFF122137)
        : const Color(0xFFF1F5F9);
    final textColor = isDark
        ? const Color(0xFFF8FAFC)
        : theme.textTheme.bodyMedium?.color ?? Colors.black;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        title: const Text('Research Gaps'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'AI Research Gaps',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Find opportunities and research gaps recommended by Gemini.',
                style: TextStyle(fontSize: 14, color: Color(0xFF94A3B8)),
              ),
              const SizedBox(height: 20),

              // Analyze Topic form card
              Container(
                decoration: BoxDecoration(
                  color: cardBg,
                  border: Border.all(color: borderColor),
                  borderRadius: BorderRadius.circular(24),
                ),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'ANALYZE NEW RESEARCH TOPIC',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF94A3B8),
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
                              borderRadius: BorderRadius.circular(12),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            alignment: Alignment.centerLeft,
                            child: TextField(
                              controller: topic,
                              style: const TextStyle(fontSize: 14),
                              decoration: const InputDecoration.collapsed(
                                hintText: 'Analyze new research topic',
                                hintStyle: TextStyle(color: Color(0xFF64748B)),
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
                              backgroundColor: const Color(0xFF1D4ED8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              elevation: 0,
                            ),
                            child: analyzing
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text(
                                    'Analyze',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.bold,
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
                      label: 'Active',
                      active: status == 'active',
                      onTap: () => setState(() => status = 'active'),
                    ),
                    _TabButton(
                      label: 'Resolved',
                      active: status == 'resolved',
                      onTap: () => setState(() => status = 'resolved'),
                    ),
                    _TabButton(
                      label: 'Dismissed',
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
                  borderRadius: BorderRadius.circular(16),
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
                          const Icon(
                            Icons.search,
                            size: 16,
                            color: Color(0xFF64748B),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              controller: search,
                              onChanged: (_) => setState(() {}),
                              style: const TextStyle(fontSize: 12),
                              decoration: const InputDecoration.collapsed(
                                hintText: 'Filter gaps by topic name...',
                                hintStyle: TextStyle(color: Color(0xFF64748B)),
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
                        const Text(
                          'SORT BY',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF94A3B8),
                          ),
                        ),
                        DropdownButton<String>(
                          value: _sortBy,
                          underline: const SizedBox(),
                          dropdownColor: theme.cardColor,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF06B6D4),
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: 'evidence',
                              child: Text('Evidence-backed'),
                            ),
                            DropdownMenuItem(
                              value: 'confidence',
                              child: Text('Confidence'),
                            ),
                            DropdownMenuItem(
                              value: 'newest',
                              child: Text('Newest'),
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
                    const Text(
                      'MIN CONFIDENCE',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Confidence chips
                    Row(
                      children: [
                        _ConfidenceChip(
                          label: 'All',
                          active: minConfidence == null,
                          onTap: () => setState(() => minConfidence = null),
                          inputBg: inputBg,
                          borderColor: borderColor,
                          textColor: textColor,
                        ),
                        const SizedBox(width: 8),
                        _ConfidenceChip(
                          label: 'Medium (≥40%)',
                          active: minConfidence == 0.4,
                          onTap: () => setState(() => minConfidence = 0.4),
                          inputBg: inputBg,
                          borderColor: borderColor,
                          textColor: textColor,
                        ),
                        const SizedBox(width: 8),
                        _ConfidenceChip(
                          label: 'High (≥70%)',
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
                    return const AppEmptyState(
                      icon: Icons.lightbulb_outline,
                      title: 'No research gaps found',
                      message: 'Try another filter or submit a topic.',
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
                        '${data.total} research gap(s) found',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF94A3B8),
                        ),
                        textAlign: TextAlign.right,
                      ),
                    ],
                  );
                },
                loading: () => const AppLoading(message: 'Loading gaps...'),
                error: (error, _) => AppErrorState(message: error.toString()),
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
          final theme = Theme.of(context);
          final isDark = theme.brightness == Brightness.dark;

          final badgeColor = gap.status == 'resolved'
              ? const Color(0xFF10B981)
              : gap.status == 'dismissed'
              ? const Color(0xFFEF4444)
              : const Color(0xFF3B82F6);

          final badgeText = gap.status == 'resolved'
              ? 'VALIDATED'
              : gap.status == 'dismissed'
              ? 'REJECTED'
              : 'PENDING';

          return Container(
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : Colors.white,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(24),
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
                        color: isDark
                            ? const Color(0xFF475569)
                            : const Color(0xFFCBD5E1),
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
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
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
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            color: badgeColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 24),

                  const Text(
                    'Summary Description',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    gap.description,
                    style: const TextStyle(fontSize: 13, height: 1.4),
                  ),
                  const SizedBox(height: 16),

                  const Text(
                    'AI Reasoning & Grounding',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    gap.rationale.isEmpty
                        ? 'Gemini identified this gap based on semantic distances in this publication corpus.'
                        : gap.rationale,
                    style: const TextStyle(
                      fontSize: 13,
                      fontStyle: FontStyle.italic,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 16),

                  const Text(
                    'Validation Metrics',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _ConfidenceBar(value: gap.confidence),
                      const SizedBox(width: 16),
                      Text(
                        'Evidence Papers: ${gap.evidenceCount}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  if (gap.supportingPapers.isNotEmpty ||
                      gap.supportingPaperIds.isNotEmpty) ...[
                    const Text(
                      'Grounding Evidence Papers',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                        color: Color(0xFF94A3B8),
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
                              paper?.title ?? 'Supporting evidence paper',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                decoration: TextDecoration.underline,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: paper == null
                                ? Text(
                                    'Paper ID: $paperId',
                                    style: const TextStyle(
                                      fontSize: 10,
                                      color: Color(0xFF94A3B8),
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
                                    style: const TextStyle(
                                      fontSize: 10,
                                      color: Color(0xFF94A3B8),
                                    ),
                                  ),
                            leading: const Icon(
                              Icons.article_outlined,
                              size: 18,
                              color: Color(0xFF06B6D4),
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
                  const Text(
                    'Actions',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF06B6D4),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
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
                          icon: const Icon(
                            Icons.search,
                            size: 14,
                            color: Colors.white,
                          ),
                          label: const Text(
                            'Search Solutions',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF8B5CF6),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          onPressed: () {
                            Navigator.pop(context);
                            unawaited(
                              showDialog<void>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: const Text('Draft Proposal Outline'),
                                  content: const Text(
                                    'Do you want to draft a research proposal outline to address this gap?',
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () => Navigator.pop(context),
                                      child: const Text('Cancel'),
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
                                      child: const Text('Draft with AI'),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                          icon: const Icon(
                            Icons.edit_note,
                            size: 14,
                            color: Colors.white,
                          ),
                          label: const Text(
                            'Draft Proposal',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
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
                              foregroundColor: const Color(0xFF10B981),
                              side: const BorderSide(color: Color(0xFF10B981)),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            onPressed: () {
                              Navigator.pop(context);
                              unawaited(
                                _handleStatusChange(gap.id, 'resolved'),
                              );
                            },
                            icon: const Icon(Icons.check, size: 14),
                            label: const Text(
                              'Validate Gap',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFFEF4444),
                              side: const BorderSide(color: Color(0xFFEF4444)),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            onPressed: () {
                              Navigator.pop(context);
                              unawaited(
                                _handleStatusChange(gap.id, 'dismissed'),
                              );
                            },
                            icon: const Icon(Icons.close, size: 14),
                            label: const Text(
                              'Reject Gap',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
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
                ? const Border(
                    bottom: BorderSide(color: Color(0xFF06B6D4), width: 2),
                  )
                : null,
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: active ? const Color(0xFF06B6D4) : const Color(0xFF94A3B8),
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
    final bg = active ? const Color(0xFF1D4ED8) : inputBg;
    final borderCol = active ? const Color(0xFF1D4ED8) : borderColor;
    final textCol = active ? Colors.white : textColor.withValues(alpha: 0.7);

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
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
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
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final color = value >= 0.7
        ? const Color(0xFF10B981)
        : value >= 0.4
        ? const Color(0xFFF59E0B)
        : const Color(0xFFEF4444);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 80,
          height: 6,
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF26334A) : const Color(0xFFE2E8F0),
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
          '$pct% confidence',
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            color: Color(0xFF94A3B8),
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
        ? const Color(0xFF10B981)
        : gap.status == 'dismissed'
        ? const Color(0xFFEF4444)
        : const Color(0xFF3B82F6);

    final statusText = gap.status == 'resolved'
        ? 'Validated'
        : gap.status == 'dismissed'
        ? 'Rejected'
        : 'Pending';

    // Mock severity based on confidence
    final severityText = gap.confidence >= 0.7
        ? 'High Severity'
        : gap.confidence >= 0.4
        ? 'Medium Severity'
        : 'Low Severity';

    final severityColor = gap.confidence >= 0.7
        ? const Color(0xFFEF4444)
        : gap.confidence >= 0.4
        ? const Color(0xFFF59E0B)
        : const Color(0xFF10B981);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A2332) : Colors.white,
        borderRadius: BorderRadius.circular(16),
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
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
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
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    color: statusColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            gap.description,
            style: TextStyle(
              fontSize: 12,
              color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF64748B),
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),

          // Severity & Info row
          Row(
            children: [
              Icon(Icons.warning_amber_rounded, size: 14, color: severityColor),
              const SizedBox(width: 4),
              Text(
                severityText,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: severityColor,
                ),
              ),
              const Spacer(),
              Text(
                'Evidence: ${gap.evidenceCount} papers',
                style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
              ),
            ],
          ),
          const SizedBox(height: 12),

          Container(
            padding: const EdgeInsets.only(top: 8),
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: isDark
                      ? const Color(0xFF1E293B)
                      : const Color(0xFFF1F5F9),
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
                            color: isDark
                                ? const Color(0xFF022C22)
                                : const Color(0xFFECFDF5),
                            border: Border.all(
                              color: isDark
                                  ? const Color(0xFF064E3B)
                                  : const Color(0xFFA7F3D0),
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Text(
                            'Validate',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF059669),
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
                            color: isDark
                                ? const Color(0xFF26334A)
                                : Colors.white,
                            border: Border.all(
                              color: isDark
                                  ? const Color(0xFF384A65)
                                  : const Color(0xFFE2E8F0),
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Text(
                            'Reject',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF94A3B8),
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
                      color: isDark
                          ? const Color(0xFF111C2E)
                          : const Color(0xFFF8FAFC),
                      border: Border.all(color: borderColor),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      gap.status.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF94A3B8),
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
      color: Colors.black54,
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
                        : Icons.auto_awesome,
                    size: 48,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    data.status == 'ready'
                        ? 'Analysis complete'
                        : data.status == 'failed'
                        ? 'Gap Analysis Failed'
                        : 'Analyzing Gaps with AI',
                  ),
                  if (data.errorMessage != null) Text(data.errorMessage!),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: onClose,
                    child: Text(data.status == 'ready' ? 'View gaps' : 'Close'),
                  ),
                ],
              ),
              loading: () =>
                  const AppLoading(message: 'Queueing gap analysis job...'),
              error: (error, _) => Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(error.toString()),
                  TextButton(onPressed: onClose, child: const Text('Dismiss')),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
