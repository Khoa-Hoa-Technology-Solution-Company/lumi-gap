-- Preserve existing profiles, institution history, and onboarding completion.
-- Academic role is a persona; legacy system/participant classifications remain compatible.
UPDATE academic_profiles
SET academic_role = CASE
  WHEN primary_position = 'STUDENT' THEN 'STUDENT'
  WHEN primary_position = 'LECTURER' THEN 'LECTURER'
  WHEN primary_position IS NOT NULL THEN 'RESEARCHER'
  ELSE CASE u.academic_profile_type WHEN 'student' THEN 'STUDENT' WHEN 'lecturer' THEN 'LECTURER' WHEN 'researcher' THEN 'RESEARCHER' END
END
FROM users u
WHERE u.id = academic_profiles.user_id AND academic_profiles.academic_role IS NULL;

-- Synchronize only ownership already verified by the existing email workflow.
UPDATE users u SET email_verified_at = e.verified_at
FROM user_emails e
WHERE e.user_id = u.id AND e.normalized_email = lower(trim(u.email))
  AND e.is_primary = true AND e.verified_at IS NOT NULL AND u.email_verified_at IS NULL;

-- Remove stale formal authority from previous Researcher policy; keep all history.
UPDATE user_capabilities c SET status = 'REVOKED'
WHERE c.status = 'ACTIVE'
  AND c.capability IN ('STRUCTURED_REVIEW', 'REVIEW_ARTIFACT', 'MENTOR_PROJECT', 'APPROVE_ACADEMIC_CONTRIBUTION')
  AND NOT EXISTS (SELECT 1 FROM academic_profiles p WHERE p.user_id = c.user_id
    AND p.academic_role = 'LECTURER' AND p.role_verification_status = 'VERIFIED' AND p.position_status = 'VERIFIED');
