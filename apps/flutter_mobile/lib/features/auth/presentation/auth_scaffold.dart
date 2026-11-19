import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_alert.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_brand_logo.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/features/auth/data/auth_failure.dart';

/// Layout shared by the sign-in and register screens, the same order as the
/// web pages: logo, heading, one card with the form, a link to the other
/// screen. Centred when it fits, scrollable when it does not (small phone,
/// large text, keyboard open).
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    required this.title,
    required this.form,
    required this.footer,
    super.key,
  });

  final String title;
  final Widget form;
  final Widget footer;

  static const double _verticalPadding = 24;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: context.lumi.background,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: _verticalPadding,
            ),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: math.max(
                  0,
                  constraints.maxHeight - _verticalPadding * 2,
                ),
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const LumiBrandLogo(),
                      const SizedBox(height: 24),
                      Semantics(
                        header: true,
                        child: Text(
                          title,
                          style: theme.textTheme.headlineSmall,
                          textAlign: TextAlign.center,
                        ),
                      ),
                      const SizedBox(height: 24),
                      LumiCard(child: form),
                      const SizedBox(height: 16),
                      footer,
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "Don't have an account? Create account": a sentence and a 48dp link.
class AuthFooterLink extends StatelessWidget {
  const AuthFooterLink({
    required this.prompt,
    required this.actionLabel,
    required this.onPressed,
    super.key,
  });

  final String prompt;
  final String actionLabel;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(
          prompt,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: context.lumi.foregroundSecondary,
              ),
        ),
        TextButton(onPressed: onPressed, child: Text(actionLabel)),
      ],
    );
  }
}

/// Why the last attempt failed, inside the form card, with the one action
/// that helps (reset the password, go to sign in) when there is one.
class AuthFailureNotice extends StatelessWidget {
  const AuthFailureNotice({
    required this.failure,
    this.actionLabel,
    this.onAction,
    super.key,
  });

  final AuthFailure failure;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final isWarning = failure == AuthFailure.invalidCredentials ||
        failure == AuthFailure.rateLimited ||
        failure == AuthFailure.emailTaken;
    return AppAlert(
      tone: isWarning ? AppAlertTone.warning : AppAlertTone.error,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(context.t(failure.message)),
          if (actionLabel != null && onAction != null)
            TextButton(onPressed: onAction, child: Text(actionLabel!)),
        ],
      ),
    );
  }
}

/// Primary button of an auth form: its label, or a spinner and the "working"
/// label while the request is in flight (and then it cannot be pressed).
class AuthSubmitButton extends StatelessWidget {
  const AuthSubmitButton({
    required this.label,
    required this.busyLabel,
    required this.busy,
    required this.onPressed,
    super.key,
  });

  final String label;
  final String busyLabel;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: busy ? null : onPressed,
        child: busy
            ? Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: context.lumi.foregroundSecondary,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(child: Text(busyLabel)),
                ],
              )
            : Text(label),
      ),
    );
  }
}

/// Route to an auth screen that carries the email already typed, so moving
/// between sign in, register and forgot password never loses it.
String authLocation(String path, String email) {
  final trimmed = email.trim();
  return Uri(
    path: path,
    queryParameters: trimmed.isEmpty ? null : {'email': trimmed},
  ).toString();
}
