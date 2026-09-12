import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/core/widgets/swipe_delete_tile.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({
    this.initialProjectId,
    this.initialTopic,
    this.initialQuery,
    this.initialYearFrom,
    this.initialYearTo,
    this.initialScopeFilters = const TrendScopeFilters(),
    super.key,
  });

  final String? initialProjectId;
  final String? initialTopic;
  final String? initialQuery;
  final int? initialYearFrom;
  final int? initialYearTo;
  final TrendScopeFilters initialScopeFilters;

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  late final TextEditingController topic;
  late final TextEditingController query;
  bool deepAnalysis = false;
  bool creating = false;
  String? _selectedId;
  Timer? _pollTimer;

  // Stepper RAG Flow states
  int _currentStep = 1; // 1: Setup, 2: Preview, 3: Edit, 4: Status
  ReportLanguage _selectedLanguage = ReportLanguage.auto;
  PreviewReportEvidenceResponse? _evidencePreview;
  List<String> _selectedPaperIds = [];
  bool _loadingPreview = false;

  String? get _projectId => widget.initialProjectId;

  @override
  void initState() {
    super.initState();
    topic = TextEditingController(
      text: widget.initialTopic ?? 'LLM in education',
    );
    query = TextEditingController(
      text:
          widget.initialQuery ??
          'Analyze research trends in large language models for education',
    );
  }

  @override
  void dispose() {
    topic.dispose();
    query.dispose();
    _pollTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (_selectedId != null) {
        ref.invalidate(reportProvider(_selectedId!));
      }
      ref.invalidate(reportsProvider(ReportsParams(projectId: _projectId)));
    });
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  Future<void> _fetchPreview() async {
    if (query.text.trim().length < 3) return;
    setState(() => _loadingPreview = true);

    try {
      final preview = await ref
          .read(reportsApiProvider)
          .previewEvidence(
            query: query.text.trim(),
            topic: topic.text.trim(),
            projectId: _projectId,
            yearFrom: widget.initialYearFrom,
            yearTo: widget.initialYearTo,
            fast: true,
            scopeFilters: widget.initialScopeFilters,
          );
      setState(() {
        _evidencePreview = preview;
        _selectedPaperIds = preview.papers.map((p) => p.id).toList();
        _currentStep = 2;
      });
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load evidence preview: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingPreview = false);
    }
  }

  Future<void> _createReport() async {
    setState(() => creating = true);
    try {
      final id = await ref
          .read(reportsApiProvider)
          .create(
            query: query.text.trim(),
            topic: topic.text.trim(),
            projectId: _projectId,
            yearFrom: widget.initialYearFrom,
            yearTo: widget.initialYearTo,
            deepAnalysis: deepAnalysis,
            language: _selectedLanguage,
            selectedPaperIds: _selectedPaperIds,
            scopeFilters: widget.initialScopeFilters,
          );
      setState(() {
        _selectedId = id;
        _currentStep = 4;
      });
      _startPolling();
      try {
        await ref
            .read(bookmarksApiProvider)
            .create(targetKind: 'report', targetId: id);
      } on Object catch (_) {
        // A duplicate bookmark should not block report creation.
      }
      ref.invalidate(reportsProvider(ReportsParams(projectId: _projectId)));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Report queued. Worker will generate it in the background.',
            ),
            backgroundColor: Color(0xFF06B6D4),
          ),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to queue report: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => creating = false);
    }
  }

  Future<void> _deleteReport(String id) async {
    try {
      await ref.read(reportsApiProvider).delete(id);
      if (_selectedId == id) {
        setState(() {
          _selectedId = null;
          if (_currentStep == 4) _currentStep = 1;
        });
      }
      ref.invalidate(reportsProvider(ReportsParams(projectId: _projectId)));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Report deleted successfully')),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to delete report: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'ready':
        return const Color(0xFF10B981);
      case 'failed':
        return const Color(0xFFEF4444);
      case 'generating':
        return const Color(0xFFF59E0B);
      default:
        return const Color(0xFF06B6D4);
    }
  }

  Widget _buildStepIndicator(bool isDark) {
    const activeColor = Color(0xFF06B6D4);
    final inactiveColor = isDark
        ? const Color(0xFF334155)
        : const Color(0xFFE2E8F0);

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      decoration: BoxDecoration(
        color: isDark
            ? const Color(0xFF1E293B).withValues(alpha: 0.4)
            : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _buildStepNode(
            1,
            'Setup',
            _currentStep >= 1,
            activeColor,
            inactiveColor,
          ),
          _buildStepLine(_currentStep >= 2, activeColor, inactiveColor),
          _buildStepNode(
            2,
            'Preview',
            _currentStep >= 2,
            activeColor,
            inactiveColor,
          ),
          _buildStepLine(_currentStep >= 3, activeColor, inactiveColor),
          _buildStepNode(
            3,
            'Edit Pack',
            _currentStep >= 3,
            activeColor,
            inactiveColor,
          ),
          _buildStepLine(_currentStep >= 4, activeColor, inactiveColor),
          _buildStepNode(
            4,
            'Status',
            _currentStep >= 4,
            activeColor,
            inactiveColor,
          ),
        ],
      ),
    );
  }

  Widget _buildStepNode(
    int stepNum,
    String label,
    bool isActive,
    Color activeColor,
    Color inactiveColor,
  ) {
    return Column(
      children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isActive ? activeColor : inactiveColor,
          ),
          alignment: Alignment.center,
          child: Text(
            stepNum.toString(),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
            color: isActive ? activeColor : const Color(0xFF94A3B8),
          ),
        ),
      ],
    );
  }

  Widget _buildStepLine(bool isActive, Color activeColor, Color inactiveColor) {
    return Expanded(
      child: Container(
        height: 2,
        margin: const EdgeInsets.only(left: 8, right: 8, bottom: 14),
        color: isActive ? activeColor : inactiveColor,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final reports = ref.watch(
      reportsProvider(ReportsParams(projectId: _projectId)),
    );
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

    // Load selected report details
    if (_selectedId != null) {
      ref.listen(reportProvider(_selectedId!), (previous, next) {
        next.whenData((report) {
          if (report.status == 'ready' || report.status == 'failed') {
            _stopPolling();
          } else {
            if (_pollTimer == null) {
              _startPolling();
            }
          }
        });
      });
    }
    final selectedReportQuery = _selectedId != null
        ? ref.watch(reportProvider(_selectedId!))
        : null;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        title: const Text('RAG Reports Workbench'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(reportsProvider(const ReportsParams()));
          if (_selectedId != null) {
            ref.invalidate(reportProvider(_selectedId!));
          }
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildStepIndicator(isDark),
            const SizedBox(height: 20),

            // Stepper views switcher
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: _buildStepperContent(
                cardBg,
                borderColor,
                inputBg,
                isDark,
                selectedReportQuery,
              ),
            ),
            const SizedBox(height: 24),

            const Text(
              'My reports',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),

            reports.when(
              data: (data) {
                if (data.reports.isEmpty) {
                  return const AppEmptyState(
                    title: 'No reports yet',
                    message: 'Create one above.',
                  );
                }
                return Column(
                  children: data.reports.map((report) {
                    final isSelected = _selectedId == report.id;
                    return SwipeDeleteTile(
                      tileKey: ValueKey(report.id),
                      margin: const EdgeInsets.only(bottom: 12),
                      borderRadius: BorderRadius.circular(16),
                      onDelete: () => _deleteReport(report.id),
                      child: GestureDetector(
                        onTap: () {
                          if (report.status == 'ready') {
                            unawaited(context.push('/report/${report.id}'));
                          } else {
                            setState(() {
                              _selectedId = report.id;
                              _currentStep = 4;
                            });
                            _startPolling();
                          }
                        },
                        child: Container(
                          decoration: BoxDecoration(
                            color: isSelected
                                ? (isDark
                                      ? const Color(0xFF082F49)
                                      : const Color(0xFFECFEFF))
                                : cardBg,
                            border: Border.all(
                              color: isSelected
                                  ? const Color(0xFF06B6D4)
                                  : borderColor,
                              width: isSelected ? 2 : 1,
                            ),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: isDark
                                      ? const Color(0xFF1E1B4B)
                                      : const Color(0xFFF3E8FF),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                alignment: Alignment.center,
                                child: const Icon(
                                  Icons.auto_awesome,
                                  size: 18,
                                  color: Color(0xFF8B5CF6),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      report.topic ?? report.query,
                                      style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.bold,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      report.query,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Color(0xFF94A3B8),
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      report.status.toUpperCase(),
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                        color: _statusColor(report.status),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                );
              },
              loading: () => const AppLoading(message: 'Loading reports...'),
              error: (error, _) => AppErrorState(message: error.toString()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStepperContent(
    Color cardBg,
    Color borderColor,
    Color inputBg,
    bool isDark,
    AsyncValue<AnalyticalReport>? selectedReportQuery,
  ) {
    switch (_currentStep) {
      case 1:
        return _buildStep1Setup(cardBg, borderColor, inputBg, isDark);
      case 2:
        return _buildStep2Preview(cardBg, borderColor);
      case 3:
        return _buildStep3Edit(cardBg, borderColor);
      case 4:
        return _buildStep4Status(
          cardBg,
          borderColor,
          isDark,
          selectedReportQuery,
        );
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildStep1Setup(
    Color cardBg,
    Color borderColor,
    Color inputBg,
    bool isDark,
  ) {
    return Container(
      key: const ValueKey('step1'),
      decoration: BoxDecoration(
        color: cardBg,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(24),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Step 1: Configure RAG Scope',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          const Text(
            'TOPIC',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Color(0xFF94A3B8),
            ),
          ),
          const SizedBox(height: 8),
          Container(
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
              enabled: !_loadingPreview,
              decoration: const InputDecoration.collapsed(
                hintText: 'Topic label (e.g. LLM in education)',
                hintStyle: TextStyle(color: Color(0xFF64748B)),
              ),
            ),
          ),
          const SizedBox(height: 16),

          const Text(
            'RESEARCH QUESTION',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Color(0xFF94A3B8),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: inputBg,
              border: Border.all(color: borderColor),
              borderRadius: BorderRadius.circular(12),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: TextField(
              controller: query,
              style: const TextStyle(fontSize: 14),
              minLines: 3,
              maxLines: 5,
              enabled: !_loadingPreview,
              decoration: const InputDecoration.collapsed(
                hintText: 'What specific trends should Gemini write about?',
                hintStyle: TextStyle(color: Color(0xFF64748B)),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Language Selector
          const Text(
            'REPORT LANGUAGE',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Color(0xFF94A3B8),
            ),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<ReportLanguage>(
            initialValue: _selectedLanguage,
            decoration: InputDecoration(
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 4,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            items: const [
              DropdownMenuItem(
                value: ReportLanguage.auto,
                child: Text('Auto-detect Language'),
              ),
              DropdownMenuItem(
                value: ReportLanguage.en,
                child: Text('English (en)'),
              ),
              DropdownMenuItem(
                value: ReportLanguage.vi,
                child: Text('Vietnamese (vi)'),
              ),
            ],
            onChanged: _loadingPreview
                ? null
                : (val) {
                    if (val != null) {
                      setState(() {
                        _selectedLanguage = val;
                      });
                    }
                  },
          ),
          const SizedBox(height: 16),

          // Deep Analysis toggle Switch
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark
                  ? const Color(0xFF1E293B).withValues(alpha: 0.4)
                  : const Color(0xFFF8FAFC).withValues(alpha: 0.4),
              border: Border.all(color: borderColor.withValues(alpha: 0.5)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Deep Analysis',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Gemini runs detailed semantic search loops to backfill grounding bibliography.',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark
                              ? const Color(0xFF94A3B8)
                              : const Color(0xFF64748B),
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: deepAnalysis,
                  onChanged: _loadingPreview
                      ? null
                      : (value) => setState(() => deepAnalysis = value),
                  activeThumbColor: const Color(0xFF06B6D4),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: _loadingPreview || query.text.trim().isEmpty
                  ? null
                  : _fetchPreview,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1D4ED8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _loadingPreview
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Preview Evidence Pack',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStep2Preview(Color cardBg, Color borderColor) {
    final papers = _evidencePreview?.papers ?? [];
    return Container(
      key: const ValueKey('step2'),
      decoration: BoxDecoration(
        color: cardBg,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(24),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Step 2: Preview Retrieved Evidence',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            'Gemini retrieved ${papers.length} source candidates matching your query.',
            style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A).withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: borderColor.withValues(alpha: 0.5)),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, size: 16, color: Color(0xFF06B6D4)),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Adding a paper makes it available as grounded evidence for Gemini. It will not force a pre-determined conclusion.',
                    style: TextStyle(fontSize: 11, height: 1.3),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (papers.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  'No papers retrieved. Try broadening your research question.',
                  style: TextStyle(fontStyle: FontStyle.italic),
                ),
              ),
            )
          else
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 280),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: papers.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, idx) {
                  final paper = papers[idx];
                  return Card(
                    elevation: 0,
                    margin: EdgeInsets.zero,
                    color: Theme.of(context).cardColor.withValues(alpha: 0.6),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(
                        color: borderColor.withValues(alpha: 0.8),
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  paper.title,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${paper.year ?? 'N/A'} · ${paper.citations} cites · Relevance: ${paper.score.toStringAsFixed(2)}',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: Color(0xFF94A3B8),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(
                              Icons.open_in_new,
                              size: 16,
                              color: Color(0xFF06B6D4),
                            ),
                            tooltip: 'Open paper detail',
                            onPressed: () => context.push('/paper/${paper.id}'),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => setState(() => _currentStep = 1),
                  child: const Text('Back to Setup'),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF06B6D4),
                  ),
                  onPressed: papers.isEmpty
                      ? null
                      : () => setState(() => _currentStep = 3),
                  child: const Text(
                    'Edit Evidence',
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
    );
  }

  Widget _buildStep3Edit(Color cardBg, Color borderColor) {
    final papers = _evidencePreview?.papers ?? [];
    return Container(
      key: const ValueKey('step3'),
      decoration: BoxDecoration(
        color: cardBg,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(24),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Step 3: Edit Evidence Pack',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              Text(
                'Selected: ${_selectedPaperIds.length}/${papers.length}',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF06B6D4),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Exclude papers that may not be fully relevant to filter the grounding RAG context.',
            style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A).withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: borderColor.withValues(alpha: 0.5)),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, size: 16, color: Color(0xFF06B6D4)),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Deselected publications will not be used in the RAG generation pipeline.',
                    style: TextStyle(fontSize: 11, height: 1.3),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 280),
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: papers.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, idx) {
                final paper = papers[idx];
                final isSelected = _selectedPaperIds.contains(paper.id);

                return Card(
                  elevation: 0,
                  margin: EdgeInsets.zero,
                  color: Theme.of(context).cardColor.withValues(alpha: 0.6),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(color: borderColor.withValues(alpha: 0.8)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    child: Row(
                      children: [
                        Checkbox(
                          activeColor: const Color(0xFF06B6D4),
                          value: isSelected,
                          onChanged: (val) {
                            setState(() {
                              if (val == true) {
                                _selectedPaperIds.add(paper.id);
                              } else {
                                _selectedPaperIds.remove(paper.id);
                              }
                            });
                          },
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                paper.title,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${paper.year ?? 'N/A'} · ${paper.citations} cites',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: Color(0xFF94A3B8),
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(
                            Icons.open_in_new,
                            size: 16,
                            color: Color(0xFF06B6D4),
                          ),
                          tooltip: 'Open paper detail',
                          onPressed: () => context.push('/paper/${paper.id}'),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => setState(() => _currentStep = 2),
                  child: const Text('Back'),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1D4ED8),
                  ),
                  onPressed: creating ? null : _createReport,
                  child: creating
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Generate Report',
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
    );
  }

  Widget _buildStep4Status(
    Color cardBg,
    Color borderColor,
    bool isDark,
    AsyncValue<AnalyticalReport>? selectedReportQuery,
  ) {
    if (selectedReportQuery == null) {
      return Container(
        key: const ValueKey('step4_empty'),
        decoration: BoxDecoration(
          color: cardBg,
          border: Border.all(color: borderColor),
          borderRadius: BorderRadius.circular(24),
        ),
        padding: const EdgeInsets.all(20),
        alignment: Alignment.center,
        child: const Text('No active report selected to monitor.'),
      );
    }

    return selectedReportQuery.when(
      data: (report) => Container(
        key: const ValueKey('step4_loaded'),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF082F49) : const Color(0xFFECFEFF),
          border: Border.all(color: const Color(0xFF06B6D4)),
          borderRadius: BorderRadius.circular(24),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Step 4: Report Generation Status',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                ),
                if (report.status == 'queued' || report.status == 'generating')
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Color(0xFF06B6D4),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              report.topic ?? report.query,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Text(
                  'STATUS: ',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF94A3B8),
                  ),
                ),
                Text(
                  report.status.toUpperCase(),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: _statusColor(report.status),
                  ),
                ),
              ],
            ),
            if (report.errorMessage != null) ...[
              const SizedBox(height: 12),
              Text(
                report.errorMessage!,
                style: const TextStyle(fontSize: 13, color: Colors.red),
              ),
            ],
            if (report.markdown != null) ...[
              const SizedBox(height: 12),
              Text(
                report.markdown!,
                style: TextStyle(
                  fontSize: 13,
                  color: isDark
                      ? const Color(0xFFCFFAFE)
                      : const Color(0xFF155E75),
                  height: 1.5,
                ),
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => context.push('/report/${report.id}'),
                      icon: const Icon(
                        Icons.visibility,
                        size: 16,
                        color: Colors.white,
                      ),
                      label: const Text(
                        'View Full Report',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF06B6D4),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  OutlinedButton(
                    onPressed: () => setState(() => _currentStep = 1),
                    child: const Text('New Report'),
                  ),
                ],
              ),
            ] else ...[
              const SizedBox(height: 12),
              const Text(
                'Background worker is compiling bibliography and writing analysis...',
                style: TextStyle(
                  fontSize: 12,
                  color: Color(0xFF94A3B8),
                  fontStyle: FontStyle.italic,
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () => setState(() => _currentStep = 1),
                child: const Text('New Report Configuration'),
              ),
            ],
          ],
        ),
      ),
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: CircularProgressIndicator(color: Color(0xFF06B6D4)),
        ),
      ),
      error: (err, _) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFFEF2F2),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(err.toString(), style: const TextStyle(color: Colors.red)),
      ),
    );
  }
}
