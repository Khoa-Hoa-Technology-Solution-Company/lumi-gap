import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/auth/data/auth_api.dart';
import 'package:flutter_mobile/features/auth/data/auth_failure.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/profile/presentation/lecturer_verification_card.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Limits of the backend `UpdateProfileSchema` (auth.schema.ts).
const int institutionMaxLength = 120;

/// Error key for the institution field, or null. It may stay empty when it
/// was empty, but a set institution cannot be cleared (the backend refuses:
/// it lives in the academic profile).
String? institutionError(String value, {required String? saved}) {
  final text = value.trim();
  if (text.length > institutionMaxLength) return tk('Use at most 120 characters.');
  if (text.isEmpty && (saved ?? '').trim().isNotEmpty) {
    return tk('Enter your institution.');
  }
  return null;
}

/// [interests] with [raw] added: trimmed, and not twice (case-insensitive).
List<String> withInterest(List<String> interests, String raw) {
  final tag = raw.trim();
  if (tag.isEmpty) return interests;
  final lower = tag.toLowerCase();
  if (interests.any((t) => t.toLowerCase() == lower)) return interests;
  return [...interests, tag];
}

enum _Pw { current, fresh, confirm }

/// What the web profile page lets a user change: institution and research
/// interests (email is read-only), and the password. Same rules as the API.
class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  late final _institution = TextEditingController(
    text: ref.read(currentUserProvider)?.institution ?? '',
  );
  final _interest = TextEditingController();
  late List<String> _interests = [
    ...?ref.read(currentUserProvider)?.researchInterests,
  ];
  bool _savingProfile = false;
  bool _showProfileErrors = false;

  final _current = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();
  bool _changingPassword = false;
  bool _showPasswordErrors = false;

  @override
  void dispose() {
    _institution.dispose();
    _interest.dispose();
    _current.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _say(String key, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(context.t(key)),
        backgroundColor: error ? context.lumi.error : null,
      ),
    );
  }

  bool _profileChanged() {
    final user = ref.read(currentUserProvider);
    final saved = user?.researchInterests ?? const <String>[];
    return _institution.text.trim() != (user?.institution ?? '').trim() ||
        _interests.length != saved.length ||
        [for (var i = 0; i < saved.length; i++) saved[i] != _interests[i]]
            .contains(true);
  }

  void _addInterest() {
    final next = withInterest(_interests, _interest.text);
    setState(() {
      _interests = next;
      _interest.clear();
    });
  }

  Future<void> _saveProfile() async {
    if (_savingProfile) return;
    final user = ref.read(currentUserProvider);
    if (institutionError(_institution.text, saved: user?.institution) != null) {
      setState(() => _showProfileErrors = true);
      return;
    }
    // Something typed but not added yet is added, not lost.
    if (_interest.text.trim().isNotEmpty) _addInterest();
    setState(() => _savingProfile = true);
    final institution = _institution.text.trim();
    try {
      await ref.read(authControllerProvider.notifier).updateProfile(
            // Sent only when it changed: unchanged it would be re-checked
            // against the academic profile for nothing.
            institution: institution != (user?.institution ?? '').trim()
                ? institution
                : null,
            researchInterests: _interests,
          );
      _say(tk('Profile saved.'));
    } on Object catch (e) {
      _say(failureMessageKey(e), error: true);
    } finally {
      if (mounted) setState(() => _savingProfile = false);
    }
  }

  String? _passwordError(_Pw field, bool hasPassword) {
    if (!_showPasswordErrors) return null;
    return switch (field) {
      _Pw.current => hasPassword && _current.text.isEmpty
          ? tk('Enter your current password.')
          : null,
      _Pw.fresh => validateNewPassword(_new.text),
      _Pw.confirm => _confirm.text != _new.text ? tk('Passwords do not match.') : null,
    };
  }

  Future<void> _changePassword(bool hasPassword) async {
    if (_changingPassword) return;
    setState(() => _showPasswordErrors = true);
    if (_Pw.values.any((f) => _passwordError(f, hasPassword) != null)) {
      return;
    }
    setState(() => _changingPassword = true);
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await container.read(authApiProvider).changePassword(
            newPassword: _new.text,
            currentPassword: hasPassword ? _current.text : null,
          );
      // The API ended every session, this one included: sign out now and
      // say so, instead of failing on the next request.
      _say(tk('Password changed. Sign in again with the new password.'));
      await container.read(authControllerProvider.notifier).logout();
    } on Object catch (e) {
      // 400: the current password is wrong.
      _say(
        failureStatus(e) == 400
            ? tk('The current password is incorrect.')
            : failureMessageKey(e),
        error: true,
      );
      if (mounted) setState(() => _changingPassword = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final user = ref.watch(currentUserProvider);
    if (user == null) return const Scaffold(body: SizedBox.shrink());
    final hasPassword = user.hasPasswordLogin;
    final institutionErr = _showProfileErrors
        ? institutionError(_institution.text, saved: user.institution)
        : null;

    return Scaffold(
      appBar: AppBar(title: Text(context.t('Account'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          LumiSectionHeader(title: context.t('Profile')),
          LumiCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  context.t('Email'),
                  style: theme.textTheme.titleSmall,
                ),
                const SizedBox(height: 4),
                Text(
                  user.email,
                  style: theme.textTheme.bodyLarge
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
                const SizedBox(height: 16),
                LumiTextField(
                  label: context.t('University / Institution'),
                  controller: _institution,
                  maxLength: institutionMaxLength,
                  enabled: !_savingProfile,
                  errorText:
                      institutionErr == null ? null : context.t(institutionErr),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 16),
                Text(
                  context.t('Research interests'),
                  style: theme.textTheme.titleSmall,
                ),
                const SizedBox(height: 8),
                if (_interests.isEmpty)
                  Text(
                    context.t('No interests yet. They shape your suggestions.'),
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(color: lumi.foregroundSecondary),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final tag in _interests)
                        InputChip(
                          label: Text(tag),
                          onDeleted: _savingProfile
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
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: LumiTextField(
                        label: context.t('Add an interest'),
                        controller: _interest,
                        enabled: !_savingProfile,
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _addInterest(),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filledTonal(
                      tooltip: context.t('Add'),
                      onPressed: _savingProfile ||
                              _interest.text.trim().isEmpty
                          ? null
                          : _addInterest,
                      icon: const Icon(Icons.add),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _savingProfile ||
                          !(_profileChanged() || _interest.text.trim().isNotEmpty)
                      ? null
                      : () => unawaited(_saveProfile()),
                  child: Text(
                    _savingProfile ? context.t('Saving…') : context.t('Save'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          LumiSectionHeader(
            title: hasPassword
                ? context.t('Change password')
                : context.t('Set Password'),
            caption: hasPassword
                ? context.t('You will be signed out everywhere and sign in again.')
                : context.t('You sign in with Google. A password lets you sign in with email too.'),
          ),
          LumiCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (hasPassword) ...[
                  LumiTextField(
                    label: context.t('Current password'),
                    controller: _current,
                    isPassword: true,
                    enabled: !_changingPassword,
                    errorText: _passwordError(_Pw.current, hasPassword) == null
                        ? null
                        : context.t(_passwordError(_Pw.current, hasPassword)!),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                ],
                LumiTextField(
                  label: context.t('New password'),
                  controller: _new,
                  isPassword: true,
                  enabled: !_changingPassword,
                  helperText: context.t(passwordRulesHint),
                  errorText: _passwordError(_Pw.fresh, hasPassword) == null
                      ? null
                      : context.t(_passwordError(_Pw.fresh, hasPassword)!),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 12),
                LumiTextField(
                  label: context.t('Confirm new password'),
                  controller: _confirm,
                  isPassword: true,
                  enabled: !_changingPassword,
                  errorText: _passwordError(_Pw.confirm, hasPassword) == null
                      ? null
                      : context.t(_passwordError(_Pw.confirm, hasPassword)!),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _changingPassword
                      ? null
                      : () => unawaited(_changePassword(hasPassword)),
                  child: Text(
                    hasPassword
                        ? context.t('Change password')
                        : context.t('Set Password'),
                  ),
                ),
              ],
            ),
          ),
          const LecturerVerificationCard(),
        ],
      ),
    );
  }
}
