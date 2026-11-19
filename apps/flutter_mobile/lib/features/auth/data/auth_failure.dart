import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/features/auth/data/recovery_failure.dart';

/// Why sign in or register failed, in terms the screen can explain. The
/// server message is never shown as it is: it is English only and may say
/// more than the user should see.
enum AuthFailure {
  /// 401: wrong email or password (the backend does not say which).
  invalidCredentials,

  /// 403: the account exists but is not allowed in (suspended, banned).
  accountBlocked,

  /// 409 on register: the email already has an account.
  emailTaken,

  /// 400 / 422: the backend rejected the fields.
  invalidInput,
  rateLimited,
  offline,
  other,
}

extension AuthFailureMessage on AuthFailure {
  /// English key; show it with `context.t(failure.message)`.
  String get message => switch (this) {
        AuthFailure.invalidCredentials => tk(
            'We could not sign you in with that email and password. Check them and try again, or reset your password.',
          ),
        AuthFailure.accountBlocked =>
          tk('This account cannot access LumiGap.'),
        AuthFailure.emailTaken =>
          tk('This email already has an account. Sign in instead.'),
        AuthFailure.invalidInput =>
          tk('Some details were not accepted. Check them and try again.'),
        AuthFailure.rateLimited => RecoveryFailure.rateLimited.message,
        AuthFailure.offline => RecoveryFailure.offline.message,
        AuthFailure.other => RecoveryFailure.other.message,
      };
}

/// Maps whatever `AuthApi` threw to an [AuthFailure]. `ApiClient` wraps every
/// failure in a `DioException` whose `error` is an `ApiException`; a
/// connection problem is the one case with no HTTP status.
AuthFailure classifyAuthError(Object error) {
  if (isConnectionFailure(error)) return AuthFailure.offline;
  return switch (failureStatus(error)) {
    401 => AuthFailure.invalidCredentials,
    403 => AuthFailure.accountBlocked,
    409 => AuthFailure.emailTaken,
    400 || 422 => AuthFailure.invalidInput,
    429 => AuthFailure.rateLimited,
    _ => AuthFailure.other,
  };
}

/// Limits of the backend `RegisterSchema` / `LoginSchema`
/// (apps/backend/src/modules/auth/dto/auth.schema.ts). Keep them equal.
const int passwordMinLength = 10;
const int passwordMaxLength = 128;
const int fullNameMaxLength = 120;

/// Shown under the password box on the register screen, before any error.
final String passwordRulesHint = tk(
  'At least 10 characters, with an uppercase letter, a lowercase letter and a number.',
);

final _lower = RegExp('[a-z]');
final _upper = RegExp('[A-Z]');
final _digit = RegExp('[0-9]');

/// Email rule shared with the recovery screens. Null means valid; otherwise
/// an English key to show with `context.t`.
String? validateAuthEmail(String? value) => validateRecoveryEmail(value ?? '');

/// Sign in only checks that a password was typed: accounts made before the
/// current rules, or through Google, must still be able to try.
String? validateLoginPassword(String? value) {
  final v = value ?? '';
  if (v.isEmpty) return tk('Please enter your password');
  if (v.length > passwordMaxLength) {
    return tk('Password must be at most 128 characters');
  }
  return null;
}

/// The register rules, in the order the backend checks them. The password is
/// not trimmed: a space is a valid character in it.
String? validateNewPassword(String? value) {
  final v = value ?? '';
  if (v.isEmpty) return tk('Please enter your password');
  if (v.length < passwordMinLength) {
    return tk('Password must be at least 10 characters');
  }
  if (v.length > passwordMaxLength) {
    return tk('Password must be at most 128 characters');
  }
  if (!_lower.hasMatch(v)) {
    return tk('Password must include a lowercase letter');
  }
  if (!_upper.hasMatch(v)) {
    return tk('Password must include an uppercase letter');
  }
  if (!_digit.hasMatch(v)) return tk('Password must include a number');
  return null;
}

String? validateFullName(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return tk('Please enter your full name');
  if (v.length > fullNameMaxLength) {
    return tk('Full name must be at most 120 characters');
  }
  return null;
}
