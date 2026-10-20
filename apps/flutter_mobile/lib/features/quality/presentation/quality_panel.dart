import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_mobile/features/quality/data/quality_api.dart';
import 'package:flutter_mobile/features/quality/data/quality_paper_rubric.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_detail_page.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_project_view.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_strings.dart';
import 'package:flutter_mobile/features/quality/presentation/quality_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

enum QualityMode { reference, project }

/// AI quality panel. Papers get the reference/project mode switch; reports and gaps get the
/// same rubric rows and detail page without it.
class QualityPanel extends ConsumerStatefulWidget {
  const QualityPanel({
    required this.targetKind,
    required this.targetId,
    this.showRatings = true,
    this.onCreateProject,
    super.key,
  });

  final String targetKind;
  final String targetId;

  /// The paper screen has its own rating block and passes false.
  final bool showRatings;
  final VoidCallback? onCreateProject;

  @override
  ConsumerState<QualityPanel> createState() => _QualityPanelState();
}

class _QualityPanelState extends ConsumerState<QualityPanel> {
  QualityMode mode = QualityMode.reference;
  String? projectId;
  bool _running = false;
  bool _resumeScheduled = false;
  String? _error;
  int stars = 0;
  final comment = TextEditingController();

  bool get _isPaper => widget.targetKind == 'paper';
  bool get _projectMode => _isPaper && mode == QualityMode.project;

  QualityTarget get _target =>
      QualityTarget(widget.targetKind, widget.targetId, projectId: _projectMode ? projectId : null);

  @override
  void dispose() {
    comment.dispose();
    super.dispose();
  }

  Future<void> _run({bool force = false, QualityEvaluationTask? resume}) async {
    final s = ref.read(qualityStringsProvider);
    final api = ref.read(qualityApiProvider);
    final target = _target;
    setState(() {
      _running = true;
      _error = null;
    });
    try {
      if (resume != null) {
        await api.waitForTask(resume);
      } else {
        await api.evaluate(
          target.kind,
          target.id,
          projectId: target.projectId,
          language: s.language,
          force: force,
        );
      }
    } on QualityTaskException catch (e) {
      _error = e.timedOut ? s.timedOut : s.errorMessage(e.code);
    } on Exception {
      _error = s.failed;
    }
    if (!mounted) return;
    ref.invalidate(qualityViewProvider(target));
    setState(() {
      _running = false;
      _resumeScheduled = false;
    });
  }

  /// A pending task in the view (started earlier or elsewhere) is polled instead of restarted.
  void _maybeResume(QualityEvaluationTask? task) {
    if (task == null || !task.isPending || _running || _resumeScheduled || _error != null) return;
    _resumeScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_run(resume: task));
    });
  }

  void _push(Widget page) => unawaited(Navigator.of(context).push<void>(MaterialPageRoute<void>(builder: (_) => page)));

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(qualityStringsProvider);
    final needsProject = _projectMode && projectId == null;
    final query = needsProject ? null : ref.watch(qualityViewProvider(_target));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.auto_awesome),
                const SizedBox(width: 8),
                Expanded(child: Text(s.title, style: const TextStyle(fontWeight: FontWeight.bold))),
              ],
            ),
            if (_isPaper) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: SegmentedButton<QualityMode>(
                  style: qualityButtonStyle,
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: QualityMode.reference, label: Text(s.modeReference, maxLines: 1, overflow: TextOverflow.ellipsis)),
                    ButtonSegment(value: QualityMode.project, label: Text(s.modeProject, maxLines: 1, overflow: TextOverflow.ellipsis)),
                  ],
                  selected: {mode},
                  onSelectionChanged: (v) => setState(() {
                    mode = v.first;
                    _error = null;
                  }),
                ),
              ),
              if (_projectMode) _projectPicker(s),
            ],
            if (needsProject)
              const SizedBox.shrink()
            else
              query!.when(
                loading: () => const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
                error: (e, _) => Padding(padding: const EdgeInsets.only(top: 12), child: Text(e.toString())),
                data: (view) => _body(s, view),
              ),
          ],
        ),
      ),
    );
  }

  Widget _projectPicker(Qs s) {
    final projects = ref.watch(projectsProvider);
    return projects.when(
      loading: () => const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator())),
      error: (e, _) => Padding(padding: const EdgeInsets.only(top: 12), child: Text(e.toString())),
      data: (list) {
        if (list.isEmpty) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              QualityNotice(text: s.noProjects),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                style: qualityButtonStyle,
                onPressed: widget.onCreateProject ?? () => context.push('/projects'),
                icon: const Icon(Icons.add),
                label: Text(s.createProject),
              ),
            ],
          );
        }
        return Padding(
          padding: const EdgeInsets.only(top: 12),
          child: DropdownButtonFormField<String>(
            initialValue: projectId,
            isExpanded: true,
            decoration: InputDecoration(labelText: s.pickProject, border: const OutlineInputBorder()),
            items: [
              for (final p in list) DropdownMenuItem(value: p.id, child: Text(p.title, overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => setState(() {
              projectId = v;
              _error = null;
            }),
          ),
        );
      },
    );
  }

  Widget _body(Qs s, QualityView view) {
    _maybeResume(_projectMode ? view.projectEvaluationTask : view.evaluationTask);
    final children = <Widget>[];
    if (_running) {
      children.add(Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Row(children: [
          const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
          const SizedBox(width: 12),
          Expanded(child: Text(s.running)),
        ]),
      ));
    }
    if (_error != null) {
      children.add(QualityNotice(
        text: _error!,
        icon: Icons.error_outline,
        action: TextButton(onPressed: _running ? null : () => _run(force: true), child: Text(s.retry)),
      ));
    }
    if (_projectMode) {
      children.add(_projectBody(s, view));
    } else {
      children.add(_referenceBody(s, view));
    }
    if (widget.showRatings) children.add(_ratings(s, view));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }

  Widget _evaluateButton(Qs s, {required bool again}) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: FilledButton.tonalIcon(
        style: qualityButtonStyle,
        onPressed: _running ? null : () => _run(force: again),
        icon: Icon(again ? Icons.refresh : Icons.auto_awesome),
        label: Text(again ? s.reEvaluate : s.evaluate),
      ),
    );
  }

  Widget _rubricLink(Qs s, QualityRubric? rubric) {
    final shown = rubric ?? (_isPaper ? paperRubricFor(s.language) : null);
    if (shown == null || shown.criteria.isEmpty) return const SizedBox.shrink();
    return TextButton.icon(
      style: qualityButtonStyle,
      onPressed: () => _push(QualityRubricPage(rubric: shown)),
      icon: const Icon(Icons.rule, size: 18),
      label: Text(s.viewRubric),
    );
  }

  Widget _referenceBody(Qs s, QualityView view) {
    final eval = view.evaluation;
    if (eval == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 12),
          Text(s.evaluatePrompt, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          _evaluateButton(s, again: false),
          _rubricLink(s, null),
        ],
      );
    }
    final details = eval.details;
    final needsRefresh = eval.isOutdated || eval.isLegacy || (_isPaper && details?.facts == null);
    final criteriaIds = details == null
        ? const <String>[]
        : (details.rubric.criteria.isNotEmpty ? details.rubric.criteria.map((c) => c.id).toList() : details.criteria.map((c) => c.id).toList());
    final firstAction = details != null && details.actions.isNotEmpty ? details.actions.first : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (needsRefresh) QualityNotice(text: eval.isOutdated ? s.outdatedNotice : s.legacyNotice, icon: Icons.update),
        const SizedBox(height: 12),
        Text(details?.summary.isNotEmpty == true ? details!.summary : eval.rationale, style: const TextStyle(height: 1.4)),
        if (details?.facts != null) ...[
          QualitySectionTitle(s.readingCard),
          QualityFactsCard(s: s, facts: details!.facts!),
        ],
        if (details?.guidance != null) ...[
          QualitySectionTitle(s.readThisTo),
          QualityGuidanceBlock(s: s, guidance: details!.guidance!),
        ],
        if (details != null) ...[
          QualitySectionTitle(s.criteria),
          for (final id in criteriaIds)
            QualityCriterionRow(
              s: s,
              criterionId: id,
              title: _criterionTitle(s, details, id),
              assessment: details.criterion(id),
              onTap: () => _push(QualityDetailPage(evaluation: eval, criterionId: id)),
            ),
          if (firstAction != null) ...[
            QualitySectionTitle(s.firstAction),
            QualityActionTile(s: s, action: firstAction),
          ],
          TextButton.icon(
            style: qualityButtonStyle,
            onPressed: () => _push(QualityDetailPage(evaluation: eval)),
            icon: const Icon(Icons.article_outlined, size: 18),
            label: Text(s.viewDetail),
          ),
        ],
        _evaluateButton(s, again: true),
        _rubricLink(s, details?.rubric),
      ],
    );
  }

  String _criterionTitle(Qs s, QualityAssessment details, String id) {
    final def = details.rubric.criterion(id);
    return (def != null && def.title.isNotEmpty) ? def.title : s.criterionTitle(id);
  }

  Widget _projectBody(Qs s, QualityView view) {
    final eval = view.projectEvaluation;
    if (projectId == null) return const SizedBox.shrink();
    if (eval == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 12),
          Text(s.projectPrompt, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          _evaluateButton(s, again: false),
        ],
      );
    }
    final project = ref.watch(projectProvider(projectId!)).value;
    final inProject = project?.papers.any((p) => p.id == widget.targetId) ?? true;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (eval.outdated) QualityNotice(text: s.outdatedNotice, icon: Icons.update),
        const SizedBox(height: 12),
        QualityProjectResult(
          s: s,
          assessment: eval.assessment,
          addToProject: inProject ? null : _addToProject,
        ),
        if (inProject && project != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(s.inProject, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ),
        _evaluateButton(s, again: true),
      ],
    );
  }

  Future<void> _addToProject() async {
    final s = ref.read(qualityStringsProvider);
    final id = projectId;
    if (id == null) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(projectsApiProvider).addPaper(id, widget.targetId);
      ref.invalidate(projectProvider(id));
      messenger.showSnackBar(SnackBar(content: Text(s.addedToProject)));
    } on DioException catch (e) {
      if (e.response?.statusCode == 409) {
        ref.invalidate(projectProvider(id));
        messenger.showSnackBar(SnackBar(content: Text(s.inProject)));
      } else {
        messenger.showSnackBar(SnackBar(content: Text(s.failed)));
      }
    } on Exception {
      messenger.showSnackBar(SnackBar(content: Text(s.failed)));
    }
  }

  Widget _ratings(Qs s, QualityView view) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 28),
        Text('${s.community} - ${view.ratingCount} ${s.ratingsLine}, ${view.ratingAvg.toStringAsFixed(1)}'),
        Row(
          children: List.generate(
            5,
            (index) => IconButton(
              onPressed: () => setState(() => stars = index + 1),
              icon: Icon(index < stars ? Icons.star : Icons.star_border, color: Colors.amber),
            ),
          ),
        ),
        TextField(
          controller: comment,
          decoration: InputDecoration(labelText: s.writeReview, border: const OutlineInputBorder()),
          minLines: 2,
          maxLines: 3,
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton(
            style: qualityButtonStyle,
            onPressed: stars == 0
                ? null
                : () async {
                    await ref.read(qualityApiProvider).rate(widget.targetKind, widget.targetId, stars, comment.text.trim().isEmpty ? null : comment.text.trim());
                    ref.invalidate(qualityViewProvider(_target));
                  },
            child: Text(s.submitReview),
          ),
        ),
        ...view.ratings.map((rating) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(rating.userName.isEmpty ? s.anonymous : rating.userName),
              subtitle: Text(rating.comment ?? ''),
              trailing: Text('${rating.stars}/5'),
            )),
      ],
    );
  }
}
