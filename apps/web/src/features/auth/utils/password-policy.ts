export interface PasswordPolicyResult {
  valid: boolean;
  checks: {
    minimumLength: boolean;
    maximumLength: boolean;
    lowercase: boolean;
    uppercase: boolean;
    number: boolean;
  };
}

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const checks = {
    minimumLength: password.length >= 10,
    maximumLength: password.length <= 128,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  return { valid: Object.values(checks).every(Boolean), checks };
}
