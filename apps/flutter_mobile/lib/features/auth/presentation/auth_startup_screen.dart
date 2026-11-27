import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The start screen while the stored session is checked. If the server
/// cannot be reached the session is kept and this says so, with a retry;
/// the person is not sent to sign in again because the network was down.
class AuthStartupScreen extends ConsumerWidget {
  const AuthStartupScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth.hasError && !auth.isLoading) {
      return Scaffold(
        body: SafeArea(
          child: LumiErrorState(
            message: context.t(failureMessageKey(auth.error!)),
            onRetry: () => unawaited(
              ref.read(authControllerProvider.notifier).retryStartup(),
            ),
          ),
        ),
      );
    }
    return Scaffold(
      body: AppLoading(fullScreen: true, message: context.t('Initializing...')),
    );
  }
}
