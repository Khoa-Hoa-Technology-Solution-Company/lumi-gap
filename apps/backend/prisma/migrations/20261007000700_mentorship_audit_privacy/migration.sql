-- Keep the audit event/provenance; private guidance remains in project_activities.
-- Remove historical copies from the global admin feed and its longer retention scope.
UPDATE audit_logs
SET details = details - 'note', updated_at = CURRENT_TIMESTAMP
WHERE action_name = 'MENTOR_GUIDANCE'
  AND jsonb_typeof(details) = 'object'
  AND details ? 'note';
