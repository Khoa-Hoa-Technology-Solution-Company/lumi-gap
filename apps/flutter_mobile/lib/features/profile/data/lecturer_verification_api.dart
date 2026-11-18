import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/core/utils/json_read.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Web page where evidence is submitted (app-routes.tsx).
const lecturerVerificationWebPath = '/settings/verification/lecturer';

class LecturerVerification {
  const LecturerVerification({
    required this.status,
    this.institutionName,
    this.position,
  });
  final String status;
  final String? institutionName;
  final String? position;

  /// Title and explanation, as the web `states` table words them
  /// (lecturer-verification-status.tsx).
  (String, String) get copy => switch (status) {
        'PENDING' => (
            tk('Awaiting Admin review'),
            tk('Your verification request has been recorded. LumiGap will notify you of a result or a request for additional information.'),
          ),
        'NEEDS_MORE_INFORMATION' => (
            tk('More information required'),
            tk('An administrator needs more information to continue verifying your Lecturer position.'),
          ),
        'VERIFIED' => (
            tk('Lecturer position verified'),
            tk('LumiGap has verified your Lecturer position at the declared institution.'),
          ),
        'REJECTED' => (
            tk('Lecturer position could not be verified'),
            tk('Your request was reviewed but did not meet the verification requirements.'),
          ),
        'INVALIDATED' => (
            tk('Verification claim changed'),
            tk('Your institution or academic position changed. Submit evidence for your current claim.'),
          ),
        'EXPIRED' => (
            tk('Lecturer verification expired'),
            tk('Submit updated evidence for your current Lecturer position.'),
          ),
        _ => (
            tk('Lecturer position is not verified'),
            tk('Verify your Lecturer position to participate in official Mentoring and Academic Review.'),
          ),
      };
}

/// The lecturer part of `GET /academic-profiles/me/verification-status`, or
/// null for anyone without a lecturer claim.
final FutureProvider<LecturerVerification?> lecturerVerificationProvider =
    FutureProvider.autoDispose<LecturerVerification?>((ref) async {
  final res = await ref
      .watch(apiClientProvider)
      .dio
      .get<Map<String, dynamic>>(ApiRoutes.academicVerificationStatus);
  final lecturer = jMap(jMap(jMap(res.data)['data'])['lecturer']);
  // The block is sent to everyone (a student gets it too, NOT_SUBMITTED):
  // only a lecturer claim has a lecturer check to show.
  return lecturerVerificationFrom(lecturer);
});

/// The lecturer check in [lecturer], or null when the account does not
/// claim a lecturer role.
LecturerVerification? lecturerVerificationFrom(Json lecturer) {
  if (jStr(lecturer['academicRole']) != 'LECTURER') return null;
  return LecturerVerification(
    status: jStr(lecturer['status']) ?? 'NOT_SUBMITTED',
    institutionName: jStr(lecturer['institutionName']),
    position: jStr(lecturer['position']),
  );
}
