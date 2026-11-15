import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/app_alert.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/projects/data/projects_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Limits of the backend `createProjectSchema`
/// (apps/backend/src/modules/projects/project.controller.ts). Keep equal.
const int projectTitleMaxLength = 100;
const int projectDescriptionMaxLength = 5000;

/// Null when valid; otherwise an English key for `context.t`.
String? validateProjectTitle(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return tk('Please enter a project title');
  if (v.length > projectTitleMaxLength) {
    return tk('Project title must be at most 100 characters');
  }
  return null;
}

String? validateProjectDescription(String? value) {
  if ((value ?? '').trim().length > projectDescriptionMaxLength) {
    return tk('Description must be at most 5000 characters');
  }
  return null;
}

/// Opens the "Create project" sheet. Returns the new project, or null when
/// the sheet was closed without creating one.
Future<ProjectView?> showCreateProjectSheet(BuildContext context) {
  return showModalBottomSheet<ProjectView>(
    context: context,
    isScrollControlled: true,
    // Above the tab bar: creating a project is a task of its own, and the
    // tabs must not be reachable while its request is in flight.
    useRootNavigator: true,
    useSafeArea: true,
    builder: (_) => const _CreateProjectSheet(),
  );
}

class _CreateProjectSheet extends ConsumerStatefulWidget {
  const _CreateProjectSheet();

  @override
  ConsumerState<_CreateProjectSheet> createState() =>
      _CreateProjectSheetState();
}

class _CreateProjectSheetState extends ConsumerState<_CreateProjectSheet> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _descriptionFocus = FocusNode();

  bool _submitted = false;
  bool _submitting = false;
  String? _failureKey;

  /// Idempotency key and the details it was first sent with. Sending the
  /// same details again (after a timeout, say) reuses the key, so the server
  /// answers with the project it already created instead of a second one.
  /// Changed details get a new key: the server rejects a key reused with
  /// different details.
  String? _requestKey;
  String? _requestSignature;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _descriptionFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    // Checked and set before any await: two taps in one frame create once.
    if (_submitting) return;
    setState(() {
      _submitted = true;
      _failureKey = null;
    });
    if (!_formKey.currentState!.validate()) return;

    final title = _title.text.trim();
    final description = _description.text.trim();
    final signature = '$title\u0000$description';
    if (_requestSignature != signature) {
      _requestSignature = signature;
      _requestKey = newIdempotencyKey();
    }

    setState(() => _submitting = true);
    try {
      final project = await ref.read(projectsApiProvider).create(
            title,
            description.isEmpty ? null : description,
            idempotencyKey: _requestKey,
          );
      if (!mounted) return;
      // Only now, with the project really created, does the sheet close.
      Navigator.of(context).pop(project);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _failureKey = failureMessageKey(e);
      });
    }
  }

  String? _translated(String? key) => key == null ? null : context.t(key);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final validateMode = _submitted
        ? AutovalidateMode.onUserInteraction
        : AutovalidateMode.disabled;

    return PopScope(
      // While the request is in flight the sheet stays: closing it would
      // drop the answer and leave the user unsure whether it was created.
      canPop: !_submitting,
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
        ),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    context.t('Create project'),
                    style: theme.textTheme.titleLarge,
                  ),
                ),
                const SizedBox(height: 16),
                LumiTextField(
                  label: context.t('Project title'),
                  isRequired: true,
                  controller: _title,
                  enabled: !_submitting,
                  textCapitalization: TextCapitalization.sentences,
                  textInputAction: TextInputAction.next,
                  autovalidateMode: validateMode,
                  validator: (v) => _translated(validateProjectTitle(v)),
                  onFieldSubmitted: (_) => _descriptionFocus.requestFocus(),
                ),
                const SizedBox(height: 16),
                LumiTextField(
                  label: context.t('Description'),
                  controller: _description,
                  focusNode: _descriptionFocus,
                  enabled: !_submitting,
                  minLines: 3,
                  maxLines: 5,
                  keyboardType: TextInputType.multiline,
                  textCapitalization: TextCapitalization.sentences,
                  autovalidateMode: validateMode,
                  validator: (v) => _translated(validateProjectDescription(v)),
                ),
                if (_failureKey != null) ...[
                  const SizedBox(height: 16),
                  AppAlert(
                    tone: AppAlertTone.error,
                    child: Text(context.t(_failureKey!)),
                  ),
                ],
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _submitting
                            ? null
                            : () => Navigator.of(context).pop(),
                        child: Text(context.t('Cancel')),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed:
                            _submitting ? null : () => unawaited(_submit()),
                        child: _submitting
                            ? Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Flexible(child: Text(context.t('Creating…'))),
                                ],
                              )
                            : Text(context.t('Create')),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
