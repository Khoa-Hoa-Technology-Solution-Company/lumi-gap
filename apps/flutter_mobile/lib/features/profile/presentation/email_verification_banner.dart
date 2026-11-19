import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/auth/data/auth_api.dart';
import 'package:flutter_mobile/features/auth/data/recovery_failure.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Seconds the resend button stays locked after a successful send. Keeps users
/// from burning the shared `recoveryLimiter` (15 per hour in production).
const resendCooldownSeconds = 60;

/// "Email chưa xác minh" card on the profile. Renders nothing when there is no
/// signed-in user or `emailVerifiedAt` is set.
class EmailVerificationBanner extends ConsumerStatefulWidget {
  const EmailVerificationBanner({super.key});

  @override
  ConsumerState<EmailVerificationBanner> createState() =>
      _EmailVerificationBannerState();
}

class _EmailVerificationBannerState
    extends ConsumerState<EmailVerificationBanner> {
  Timer? _timer;
  int _cooldown = 0;
  bool _resending = false;
  bool _checking = false;
  // English keys, translated when shown so a language change applies at once.
  String? _success; // only "Verification email sent…"
  String? _info; // neutral status, e.g. still unverified
  String? _problem; // failure message

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startCooldown() {
    _timer?.cancel();
    setState(() => _cooldown = resendCooldownSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() => _cooldown--);
      if (_cooldown <= 0) timer.cancel();
    });
  }

  Future<void> _resend(String email) async {
    if (_resending || _cooldown > 0) return;
    setState(() {
      _resending = true;
      _success = null;
      _info = null;
      _problem = null;
    });
    try {
      await ref.read(authApiProvider).resendVerification(email);
      if (!mounted) return;
      setState(() {
        _resending = false;
        _success = tk('Verification email sent. Check your inbox.');
      });
      _startCooldown();
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _resending = false;
        _problem = classifyRecoveryError(e).message;
      });
    }
  }

  Future<void> _recheck() async {
    if (_checking) return;
    setState(() {
      _checking = true;
      _success = null;
      _info = null;
      _problem = null;
    });
    try {
      final fresh = await ref.read(authControllerProvider.notifier).refreshUser();
      if (!mounted) return;
      setState(() {
        _checking = false;
        // A verified user hides the banner; only the unverified case needs words.
        if (fresh != null && fresh.emailVerifiedAt == null) {
          _info = tk('Your email is still not verified.');
        }
      });
    } on Object catch (_) {
      if (!mounted) return;
      setState(() {
        _checking = false;
        _problem = tk('Could not reload your account. Please try again.');
      });
    }
  }

  /// Icon and colour follow the meaning: success only for a real success,
  /// error for failures, a neutral info icon for "still unverified".
  ({IconData icon, Color color, String text})? _status(LumiColors lumi) {
    if (_problem != null) {
      return (icon: Icons.error_outline, color: lumi.error, text: context.t(_problem!));
    }
    if (_success != null) {
      return (
        icon: Icons.check_circle_outline,
        color: lumi.success,
        text: context.t(_success!),
      );
    }
    if (_info != null) {
      return (
        icon: Icons.info_outline,
        color: lumi.foregroundSecondary,
        text: context.t(_info!),
      );
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null || user.emailVerifiedAt != null) {
      return const SizedBox.shrink();
    }

    final theme = Theme.of(context);
    final lumi = context.lumi;
    final busy = _resending || _checking;

    return Semantics(
      container: true,
      child: Container(
        decoration: BoxDecoration(
          color: lumi.surface,
          border: Border.all(color: lumi.line),
          borderRadius: BorderRadius.circular(8),
        ),
        clipBehavior: Clip.antiAlias,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ColoredBox(color: lumi.warning, child: const SizedBox(width: 4)),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.warning_amber_outlined,
                          size: 20, color: lumi.warning),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(context.t('Email not verified'),
                                style: theme.textTheme.titleMedium),
                            Text(
                              context.t('Some features need a verified email.'),
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: lumi.foregroundSecondary,
                              ),
                            ),
                            if (_status(lumi) case final status?) ...[
                              const SizedBox(height: 8),
                              Semantics(
                                liveRegion: true,
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Icon(status.icon,
                                        size: 16, color: status.color),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Text(
                                        status.text,
                                        style: theme.textTheme.bodyMedium,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                OutlinedButton(
                                  onPressed: busy || _cooldown > 0
                                      ? null
                                      : () => unawaited(_resend(user.email)),
                                  child: Text(
                                    _resending
                                        ? context.t('Sending…')
                                        : _cooldown > 0
                                            ? context.t('Resend in {{cooldown}}s', {'cooldown': _cooldown})
                                            : context.t('Resend email'),
                                  ),
                                ),
                                TextButton(
                                  onPressed:
                                      busy ? null : () => unawaited(_recheck()),
                                  child: Text(_checking
                                      ? context.t('Checking…')
                                      : context.t('I have verified')),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
