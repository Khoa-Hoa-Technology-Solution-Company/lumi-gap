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

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.initialEmail = ''});

  /// Email typed on the register or forgot-password screen.
  final String initialEmail;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _email;
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();

  /// True once Sign in was pressed: from then on fields re-validate as the
  /// user fixes them. Before that, nothing is flagged while they type.
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
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    // Checked and set before any await, so a second tap in the same frame
    // cannot start a second request.
    if (_submitting) return;
    setState(() {
      _submitted = true;
      _failure = null;
    });
    if (!_formKey.currentState!.validate()) return;

    setState(() => _submitting = true);
    final failure = await ref
        .read(authControllerProvider.notifier)
        .login(_email.text.trim(), _password.text);
    if (!mounted) return;
    if (failure == null) {
      // Signed in: the router is already replacing this screen. Stay busy so
      // the form cannot be sent again while it leaves.
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
      title: context.t('Welcome back!'),
      form: AutofillGroup(
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              LumiTextField(
                label: context.t('Email'),
                isRequired: true,
                controller: _email,
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
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                autovalidateMode: validateMode,
                validator: (v) => _translated(validateLoginPassword(v)),
                onFieldSubmitted: (_) => unawaited(_submit()),
              ),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(
                  onPressed: _submitting
                      ? null
                      : () => unawaited(
                            context.push(
                              authLocation('/forgot-password', _email.text),
                            ),
                          ),
                  child: Text(context.t('Forgot password?')),
                ),
              ),
              if (_failure != null) ...[
                const SizedBox(height: 8),
                AuthFailureNotice(
                  failure: _failure!,
                  actionLabel: _failure == AuthFailure.invalidCredentials
                      ? context.t('Reset password')
                      : null,
                  onAction: () => unawaited(
                    context.push(
                      authLocation('/forgot-password', _email.text),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              AuthSubmitButton(
                label: context.t('Sign in'),
                busyLabel: context.t('Signing in…'),
                busy: _submitting,
                onPressed: () => unawaited(_submit()),
              ),
            ],
          ),
        ),
      ),
      footer: AuthFooterLink(
        prompt: context.t("Don't have an account?"),
        actionLabel: context.t('Create account'),
        onPressed: _submitting
            ? null
            : () => context.go(authLocation('/register', _email.text)),
      ),
    );
  }
}
