import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/auth/data/auth_failure.dart';
import 'package:flutter_mobile/features/auth/presentation/auth_scaffold.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Create an account: full name, email, password, the same three fields as
/// the web form. There is no role choice; a new account is signed in at once.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, this.initialEmail = ''});

  /// Email typed on the sign-in screen.
  final String initialEmail;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fullName = TextEditingController();
  late final TextEditingController _email;
  final _password = TextEditingController();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();

  bool _submitted = false;
  bool _submitting = false;
  AuthFailure? _failure;

  @override
  void initState() {
    super.initState();
    _email = TextEditingController(text: widget.initialEmail);
  }

  @override
  void dispose() {
    _fullName.dispose();
    _email.dispose();
    _password.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    // Checked and set before any await, so a second tap in the same frame
    // cannot create the account twice.
    if (_submitting) return;
    setState(() {
      _submitted = true;
      _failure = null;
    });
    if (!_formKey.currentState!.validate()) return;

    setState(() => _submitting = true);
    final failure = await ref.read(authControllerProvider.notifier).register(
          _email.text.trim(),
          _password.text,
          _fullName.text.trim(),
        );
    if (!mounted) return;
    if (failure == null) {
      // Account created and signed in: the router is leaving this screen.
      TextInput.finishAutofillContext();
      return;
    }
    setState(() {
      _submitting = false;
      _failure = failure;
    });
  }

  String? _translated(String? key) => key == null ? null : context.t(key);

  @override
  Widget build(BuildContext context) {
    final validateMode = _submitted
        ? AutovalidateMode.onUserInteraction
        : AutovalidateMode.disabled;

    return AuthScaffold(
      title: context.t('Create an account'),
      form: AutofillGroup(
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              LumiTextField(
                label: context.t('Full name'),
                isRequired: true,
                controller: _fullName,
                enabled: !_submitting,
                keyboardType: TextInputType.name,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                autovalidateMode: validateMode,
                validator: (v) => _translated(validateFullName(v)),
                onFieldSubmitted: (_) => _emailFocus.requestFocus(),
              ),
              const SizedBox(height: 16),
              LumiTextField(
                label: context.t('Email'),
                isRequired: true,
                controller: _email,
                focusNode: _emailFocus,
                enabled: !_submitting,
                hintText: 'example@gmail.com', // i18n-ignore: sample address
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [
                  AutofillHints.username,
                  AutofillHints.email,
                ],
                autocorrect: false,
                enableSuggestions: false,
                autovalidateMode: validateMode,
                validator: (v) => _translated(validateAuthEmail(v)),
                onFieldSubmitted: (_) => _passwordFocus.requestFocus(),
              ),
              const SizedBox(height: 16),
              LumiTextField(
                label: context.t('Password'),
                isRequired: true,
                isPassword: true,
                controller: _password,
                focusNode: _passwordFocus,
                enabled: !_submitting,
                helperText: context.t(passwordRulesHint),
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.newPassword],
                autovalidateMode: validateMode,
                validator: (v) => _translated(validateNewPassword(v)),
                onFieldSubmitted: (_) => unawaited(_submit()),
              ),
              if (_failure != null) ...[
                const SizedBox(height: 16),
                AuthFailureNotice(
                  failure: _failure!,
                  actionLabel: _failure == AuthFailure.emailTaken
                      ? context.t('Sign in')
                      : null,
                  onAction: () =>
                      context.go(authLocation('/login', _email.text)),
                ),
              ],
              const SizedBox(height: 24),
              AuthSubmitButton(
                label: context.t('Create account'),
                busyLabel: context.t('Creating account…'),
                busy: _submitting,
                onPressed: () => unawaited(_submit()),
              ),
            ],
          ),
        ),
      ),
      footer: AuthFooterLink(
        prompt: context.t('Already have an account?'),
        actionLabel: context.t('Sign in'),
        onPressed: _submitting
            ? null
            : () => context.go(authLocation('/login', _email.text)),
      ),
    );
  }
}
