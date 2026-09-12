import { PASSWORD_REQUIREMENTS } from '../lib/passwordStrength';

type PasswordStrengthChecklistProps = {
  password: string;
  className?: string;
};

export function PasswordStrengthChecklist({ password, className = '' }: PasswordStrengthChecklistProps) {
  if (!password) {
    return null;
  }

  const missingRequirements = PASSWORD_REQUIREMENTS.filter((requirement) => !requirement.test(password));

  if (missingRequirements.length === 0) {
    return <p className={`text-sm font-medium text-green-700 ${className}`}>Mật khẩu đủ mạnh.</p>;
  }

  return (
    <p className={`text-sm text-muted-foreground ${className}`}>
      Mật khẩu cần có: {missingRequirements.map((requirement) => requirement.label).join(', ')}.
    </p>
  );
}
