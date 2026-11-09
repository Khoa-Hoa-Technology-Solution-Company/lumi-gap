import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_alert.dart';
import 'package:flutter_mobile/features/auth/data/auth_api.dart';
import 'package:flutter_mobile/features/auth/data/recovery_failure.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Shown for every 202, whether or not the email has an account.
const forgotPasswordSuccessMessage =
    'Nếu email này có tài khoản, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu. '
    'Liên kết trong email sẽ mở trên trình duyệt.';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});

  final String initialEmail;

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  late final TextEditingController _email;
  String? _emailError;
  bool _sending = false;
  bool _sent = false;
  RecoveryFailure? _failure;

  @override
  void initState() {
    super.initState();
    _email = TextEditingController(text: widget.initialEmail);
  }

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    // Set synchronously, before any await, so a second tap in the same frame
    // cannot start a second request.
    if (_sending) return;
    final error = validateRecoveryEmail(_email.text);
    setState(() {
      _emailError = error;
      _failure = null;
    });
    if (error != null) return;

    setState(() => _sending = true);
    try {
      await ref.read(authApiProvider).forgotPassword(_email.text.trim());
      if (!mounted) return;
      setState(() {
        _sending = false;
        _sent = true;
      });
    } on Object catch (e) {
      if (!mounted) return;
      final failure = classifyRecoveryError(e);
      setState(() {
        _sending = false;
        if (failure == RecoveryFailure.invalidEmail) {
          _emailError = failure.message;
        } else {
          _failure = failure;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;

    return Scaffold(
      appBar: AppBar(title: const Text('Quên mật khẩu')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: _sent
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const AppAlert(
                      tone: AppAlertTone.success,
                      child: Text(forgotPasswordSuccessMessage),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () =>
                          context.canPop() ? context.pop() : context.go('/login'),
                      child: const Text('Quay lại đăng nhập'),
                    ),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Nhập email của tài khoản. Chúng tôi sẽ gửi hướng dẫn '
                      'đặt lại mật khẩu.',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: lumi.foregroundSecondary,
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _email,
                      enabled: !_sending,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => unawaited(_send()),
                      onChanged: (_) {
                        if (_emailError != null) {
                          setState(() => _emailError = null);
                        }
                      },
                      decoration: InputDecoration(
                        labelText: 'Email',
                        error: _emailError == null
                            ? null
                            : Row(
                                children: [
                                  Icon(
                                    Icons.error_outline,
                                    size: 16,
                                    color: lumi.error,
                                  ),
                                  const SizedBox(width: 6),
                                  Expanded(child: Text(_emailError!)),
                                ],
                              ),
                      ),
                    ),
                    if (_failure != null) ...[
                      const SizedBox(height: 16),
                      AppAlert(
                        tone: _failure == RecoveryFailure.rateLimited
                            ? AppAlertTone.warning
                            : AppAlertTone.error,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_failure!.message),
                            if (_failure == RecoveryFailure.offline ||
                                _failure == RecoveryFailure.other)
                              TextButton(
                                onPressed: _sending
                                    ? null
                                    : () => unawaited(_send()),
                                child: const Text('Thử lại'),
                              ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _sending ? null : () => unawaited(_send()),
                        child: _sending
                            ? Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: lumi.foregroundSecondary,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  const Text('Đang gửi…'),
                                ],
                              )
                            : const Text('Gửi hướng dẫn'),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
