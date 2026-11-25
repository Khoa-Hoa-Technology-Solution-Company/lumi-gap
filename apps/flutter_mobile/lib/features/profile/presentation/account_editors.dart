import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/auth/data/auth_api.dart';
import 'package:flutter_mobile/features/auth/data/auth_failure.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/profile/presentation/account_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// One focused editor of an account field: the field, then one full-width
/// action at the bottom (above the keyboard).
class _EditorScaffold extends StatelessWidget {
  const _EditorScaffold({
    required this.title,
    required this.children,
    required this.actionLabel,
    required this.onAction,
  });

  final String title;
  final List<Widget> children;
  final String actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: children,
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
            onPressed: onAction,
            child: Text(actionLabel),
          ),
        ),
      ),
    );
  }
}

void _say(BuildContext context, String key, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(context.t(key)),
      backgroundColor: error ? context.lumi.error : null,
    ),
  );
}

/// University / institution. It may stay empty when it was empty; a set one
/// cannot be cleared (the backend keeps it in the academic profile).
class AccountInstitutionScreen extends ConsumerStatefulWidget {
  const AccountInstitutionScreen({super.key});

  @override
  ConsumerState<AccountInstitutionScreen> createState() =>
      _AccountInstitutionScreenState();
}

class _AccountInstitutionScreenState
    extends ConsumerState<AccountInstitutionScreen> {
  late final String _saved = ref.read(currentUserProvider)?.institution ?? '';
  late final _text = TextEditingController(text: _saved);
  bool _saving = false;
  bool _showErrors = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    if (institutionError(_text.text, saved: _saved) != null) {
      setState(() => _showErrors = true);
      return;
    }
    setState(() => _saving = true);
    final navigator = Navigator.of(context);
    try {
      await ref
          .read(authControllerProvider.notifier)
          .updateProfile(institution: _text.text.trim());
      if (!mounted) return;
      _say(context, tk('Profile saved.'));
      navigator.pop();
    } on Object catch (e) {
      if (mounted) _say(context, failureMessageKey(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final error =
        _showErrors ? institutionError(_text.text, saved: _saved) : null;
    final changed = _text.text.trim() != _saved.trim();
    return _EditorScaffold(
      title: context.t('University / institution'),
      actionLabel: _saving ? context.t('Saving…') : context.t('Save'),
      onAction: _saving || !changed ? null : () => unawaited(_save()),
      children: [
        LumiTextField(
          label: context.t('University / institution'),
          controller: _text,
          maxLength: institutionMaxLength,
          enabled: !_saving,
          errorText: error == null ? null : context.t(error),
          textInputAction: TextInputAction.done,
          onFieldSubmitted: (_) => unawaited(_save()),
          onChanged: (_) => setState(() {}),
        ),
      ],
    );
  }
}

/// Research interests: chips with a remove button, and a field that adds
/// one on the keyboard's done key. Saved together.
class AccountInterestsScreen extends ConsumerStatefulWidget {
  const AccountInterestsScreen({super.key});

  @override
  ConsumerState<AccountInterestsScreen> createState() =>
      _AccountInterestsScreenState();
}

class _AccountInterestsScreenState
    extends ConsumerState<AccountInterestsScreen> {
  late final List<String> _saved = [
    ...?ref.read(currentUserProvider)?.researchInterests,
  ];
  late List<String> _interests = [..._saved];
  final _add = TextEditingController();
  final _focus = FocusNode();
  bool _saving = false;

  @override
  void dispose() {
    _add.dispose();
    _focus.dispose();
    super.dispose();
  }

  bool get _changed =>
      _add.text.trim().isNotEmpty ||
      _interests.length != _saved.length ||
      [for (var i = 0; i < _saved.length; i++) _saved[i] != _interests[i]]
          .contains(true);

  void _addTyped() {
    setState(() {
      _interests = withInterest(_interests, _add.text);
      _add.clear();
    });
    // Ready for the next one.
    _focus.requestFocus();
  }

  Future<void> _save() async {
    if (_saving) return;
    // Something typed but not added yet is added, not lost.
    if (_add.text.trim().isNotEmpty) {
      setState(() {
        _interests = withInterest(_interests, _add.text);
        _add.clear();
      });
    }
    setState(() => _saving = true);
    final navigator = Navigator.of(context);
    try {
      await ref
          .read(authControllerProvider.notifier)
          .updateProfile(researchInterests: _interests);
      if (!mounted) return;
      _say(context, tk('Profile saved.'));
      navigator.pop();
    } on Object catch (e) {
      if (mounted) _say(context, failureMessageKey(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _EditorScaffold(
      title: context.t('Research interests'),
      actionLabel: _saving ? context.t('Saving…') : context.t('Save'),
      onAction: _saving || !_changed ? null : () => unawaited(_save()),
      children: [
        if (_interests.isEmpty)
          Text(
            context.t('No interests yet. They shape your suggestions.'),
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: context.lumi.foregroundSecondary),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final tag in _interests)
                InputChip(
                  label: Text(tag),
                  onDeleted: _saving
                      ? null
                      : () => setState(
                            () => _interests = [
                              for (final t in _interests)
                                if (t != tag) t,
                            ],
                          ),
                  deleteButtonTooltipMessage:
                      context.t('Remove {{name}}', {'name': tag}),
                ),
            ],
          ),
        const SizedBox(height: 16),
        LumiTextField(
          label: context.t('Add an interest'),
          controller: _add,
          focusNode: _focus,
          enabled: !_saving,
          textInputAction: TextInputAction.done,
          onFieldSubmitted: (_) => _addTyped(),
          onChanged: (_) => setState(() {}),
        ),
      ],
    );
  }
}

enum _Pw { current, fresh, confirm }

/// Change (or, for a Google-only account, set) the password. The API ends
/// every session, this one included, so the app signs out afterwards.
class AccountPasswordScreen extends ConsumerStatefulWidget {
  const AccountPasswordScreen({super.key});

  @override
  ConsumerState<AccountPasswordScreen> createState() =>
      _AccountPasswordScreenState();
}

class _AccountPasswordScreenState extends ConsumerState<AccountPasswordScreen> {
  final _current = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  bool _showErrors = false;

  @override
  void dispose() {
    _current.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String? _error(_Pw field, bool hasPassword) {
    if (!_showErrors) return null;
    return switch (field) {
      _Pw.current => hasPassword && _current.text.isEmpty
          ? tk('Enter your current password.')
          : null,
      _Pw.fresh => validateNewPassword(_new.text),
      _Pw.confirm =>
        _confirm.text != _new.text ? tk('Passwords do not match.') : null,
    };
  }

  Future<void> _submit(bool hasPassword) async {
    if (_busy) return;
    setState(() => _showErrors = true);
    if (_Pw.values.any((f) => _error(f, hasPassword) != null)) return;
    setState(() => _busy = true);
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    final locale = context.appLocale;
    final errorColor = context.lumi.error;
    try {
      await container.read(authApiProvider).changePassword(
            newPassword: _new.text,
            currentPassword: hasPassword ? _current.text : null,
          );
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            translate(
              'Password changed. Sign in again with the new password.',
              locale,
            ),
          ),
        ),
      );
      await container.read(authControllerProvider.notifier).logout();
    } on Object catch (e) {
      // 400: the current password is wrong.
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            translate(
              failureStatus(e) == 400
                  ? 'The current password is incorrect.'
                  : failureMessageKey(e),
              locale,
            ),
          ),
          backgroundColor: errorColor,
        ),
      );
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final hasPassword = user?.hasPasswordLogin ?? true;
    String? err(_Pw f) {
      final key = _error(f, hasPassword);
      return key == null ? null : context.t(key);
    }

    final title =
        hasPassword ? context.t('Change password') : context.t('Set password');
    return _EditorScaffold(
      title: title,
      actionLabel: title,
      onAction: _busy ? null : () => unawaited(_submit(hasPassword)),
      children: [
        Text(
          hasPassword
              ? context.t('You will be signed out everywhere and sign in again.')
              : context.t(
                  'You sign in with Google. A password lets you sign in with email too.',
                ),
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(color: context.lumi.foregroundSecondary),
        ),
        const SizedBox(height: 16),
        if (hasPassword) ...[
          LumiTextField(
            label: context.t('Current password'),
            controller: _current,
            isPassword: true,
            enabled: !_busy,
            errorText: err(_Pw.current),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
        ],
        LumiTextField(
          label: context.t('New password'),
          controller: _new,
          isPassword: true,
          enabled: !_busy,
          helperText: context.t(passwordRulesHint),
          errorText: err(_Pw.fresh),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        LumiTextField(
          label: context.t('Confirm new password'),
          controller: _confirm,
          isPassword: true,
          enabled: !_busy,
          errorText: err(_Pw.confirm),
          onChanged: (_) => setState(() {}),
        ),
      ],
    );
  }
}
