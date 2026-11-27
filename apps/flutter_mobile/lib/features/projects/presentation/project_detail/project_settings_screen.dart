import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Backend limits of a project (`project.controller.ts` updateProjectSchema).
const projectTitleMax = 100;
const projectDescriptionMax = 5000;

/// Name and description of a project. Owner only: the detail screen offers
/// it to the owner alone, as the backend allows (EDIT_SETTINGS).
class ProjectSettingsScreen extends ConsumerStatefulWidget {
  const ProjectSettingsScreen({required this.project, super.key});

  final ProjectView project;

  @override
  ConsumerState<ProjectSettingsScreen> createState() =>
      _ProjectSettingsScreenState();
}

class _ProjectSettingsScreenState extends ConsumerState<ProjectSettingsScreen> {
  late final _title = TextEditingController(text: widget.project.title)
    ..addListener(_changed);
  late final _description =
      TextEditingController(text: widget.project.description ?? '')
        ..addListener(_changed);
  bool _saving = false;

  void _changed() => setState(() {});

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  bool get _dirty =>
      _title.text.trim() != widget.project.title.trim() ||
      _description.text.trim() != (widget.project.description ?? '').trim();

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty || _saving || !_dirty) return;
    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final locale = context.appLocale;
    final errorColor = context.lumi.error;
    try {
      await ref.read(projectsApiProvider).update(
            widget.project.id,
            title: title,
            description: _description.text.trim(),
          );
      ref
        ..invalidate(projectProvider(widget.project.id))
        ..invalidate(projectsProvider);
      messenger.showSnackBar(
        SnackBar(content: Text(translate('Project updated', locale))),
      );
      navigator.pop();
    } on Object catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            translate('Update failed: {{e}}', locale, {
              'e': translate(failureMessageKey(e), locale),
            }),
          ),
          backgroundColor: errorColor,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final titleEmpty = _title.text.trim().isEmpty;
    return Scaffold(
      appBar: AppBar(title: Text(context.t('Project settings'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          TextField(
            controller: _title,
            maxLength: projectTitleMax,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: context.t('Project name'),
              errorText: titleEmpty ? context.t('Enter a project name.') : null,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            maxLength: projectDescriptionMax,
            minLines: 3,
            maxLines: 8,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: context.t('Description'),
              alignLabelWithHint: true,
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            8 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: FilledButton(
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            onPressed: _saving || titleEmpty || !_dirty
                ? null
                : () => unawaited(_save()),
            child: Text(
              _saving ? context.t('Saving...') : context.t('Save changes'),
            ),
          ),
        ),
      ),
    );
  }
}
