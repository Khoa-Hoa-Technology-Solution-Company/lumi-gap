export const PASSWORD_REQUIREMENTS = [
  { id: 'length', label: 'ít nhất 8 ký tự', test: (value: string) => value.length >= 8 },
  { id: 'lowercase', label: 'một chữ thường', test: (value: string) => /[a-z]/.test(value) },
  { id: 'uppercase', label: 'một chữ hoa', test: (value: string) => /[A-Z]/.test(value) },
  { id: 'number', label: 'một chữ số', test: (value: string) => /\d/.test(value) },
  { id: 'special', label: 'một ký tự đặc biệt', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
  { id: 'spaces', label: 'không có khoảng trắng', test: (value: string) => !/\s/.test(value) },
];

export function getPasswordStrengthIssues(password: string) {
  return PASSWORD_REQUIREMENTS.filter((requirement) => !requirement.test(password)).map((requirement) => requirement.label);
}

export function getPasswordStrengthError(password: string, label = 'Mật khẩu') {
  const issues = getPasswordStrengthIssues(password);
  if (issues.length === 0) return '';

  return `${label} cần có: ${issues.join(', ')}.`;
}
