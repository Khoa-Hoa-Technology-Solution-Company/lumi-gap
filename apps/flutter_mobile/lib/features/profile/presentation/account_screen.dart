import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/profile/presentation/account_editors.dart';
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

/// What the web profile page lets a user change, as rows: email (read-only),
/// institution, research interests and the password. Each row opens one
/// focused editor with its own Save; the rules are those of the API.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    if (user == null) return const Scaffold(body: SizedBox.shrink());
    final institution = (user.institution ?? '').trim();
    final interests = user.researchInterests ?? const <String>[];
    void open(Widget screen) => unawaited(
          Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen)),
        );

    return Scaffold(
      appBar: AppBar(title: Text(context.t('Account'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          LumiSectionHeader(title: context.t('Profile')),
          LumiRowGroup(
            children: [
              LumiListRow(
                icon: Icons.mail_outline,
                title: context.t('Email'),
                subtitle: user.email,
              ),
              LumiListRow(
                icon: Icons.school_outlined,
                title: context.t('University / institution'),
                subtitle: institution.isEmpty ? context.t('Not set') : institution,
                onTap: () => open(const AccountInstitutionScreen()),
              ),
              LumiListRow(
                icon: Icons.interests_outlined,
                title: context.t('Research interests'),
                subtitle: interests.isEmpty
                    ? context.t('No interests yet. They shape your suggestions.')
                    : interests.join(', '),
                onTap: () => open(const AccountInterestsScreen()),
              ),
            ],
          ),
          const SizedBox(height: 28),
          LumiSectionHeader(title: context.t('Security')),
          LumiRowGroup(
            children: [
              LumiListRow(
                icon: Icons.lock_outline,
                title: user.hasPasswordLogin
                    ? context.t('Change password')
                    : context.t('Set password'),
                onTap: () => open(const AccountPasswordScreen()),
              ),
            ],
          ),
          const LecturerVerificationCard(),
        ],
      ),
    );
  }
}
