export const PASSWORD_REQUIREMENTS = [
  { test: (value) => String(value).length >= 8, message: 'at least 8 characters' },
  { test: (value) => /[a-z]/.test(String(value)), message: 'one lowercase letter' },
  { test: (value) => /[A-Z]/.test(String(value)), message: 'one uppercase letter' },
  { test: (value) => /\d/.test(String(value)), message: 'one number' },
  { test: (value) => /[^A-Za-z0-9]/.test(String(value)), message: 'one special character' },
  { test: (value) => !/\s/.test(String(value)), message: 'no spaces' },
];

export function validatePasswordStrength(password, label = 'Password') {
  const missingRequirements = PASSWORD_REQUIREMENTS.filter((requirement) => !requirement.test(password)).map(
    (requirement) => requirement.message
  );

  if (missingRequirements.length === 0) return '';

  return `${label} must include ${missingRequirements.join(', ')}.`;
}
