import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/web_href.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/profile/data/lecturer_verification_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Lecturer position check, worded as on the web status page. Only for
/// someone with a lecturer claim; evidence is submitted on the web.
class LecturerVerificationCard extends ConsumerWidget {
  const LecturerVerificationCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final verification = ref.watch(lecturerVerificationProvider).value;
    if (verification == null) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final (title, message) = verification.copy;
    final verified = verification.status == 'VERIFIED';
    final details = [
      ?verification.position,
      ?verification.institutionName,
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(top: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LumiSectionHeader(title: context.t('Lecturer verification')),
          LumiCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                LumiChip(
                  label: context.t(title),
                  icon: verified ? Icons.verified_outlined : Icons.pending_outlined,
                  tone: switch (verification.status) {
                    'VERIFIED' => LumiChipTone.success,
                    'REJECTED' || 'EXPIRED' || 'INVALIDATED' => LumiChipTone.error,
                    'PENDING' => LumiChipTone.primary,
                    _ => LumiChipTone.warning,
                  },
                ),
                const SizedBox(height: 8),
                Text(context.t(message), style: theme.textTheme.bodyMedium),
                if (details.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(details, style: theme.textTheme.bodyMedium?.copyWith(color: lumi.foregroundSecondary)),
                ],
                if (!verified) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => unawaited(openWebPage(context, ref, lecturerVerificationWebPath)),
                    icon: const Icon(Icons.open_in_new, size: 18),
                    label: Text(context.t('Continue on the web')),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
