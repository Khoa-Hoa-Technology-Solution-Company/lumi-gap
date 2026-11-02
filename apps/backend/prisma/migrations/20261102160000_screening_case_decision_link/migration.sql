-- A reopened round can have multiple historical cases. Pin each completed case
-- to its immutable result, with a scoped FK preventing cross-project links.
ALTER TABLE screening_final_decisions ADD CONSTRAINT screening_final_decisions_id_project_id_round_id_key UNIQUE(id,project_id,round_id);
ALTER TABLE screening_adjudication_cases ADD COLUMN final_decision_id uuid UNIQUE;
ALTER TABLE screening_adjudication_cases ADD CONSTRAINT screening_case_final_decision_fk
 FOREIGN KEY(final_decision_id,project_id,round_id) REFERENCES screening_final_decisions(id,project_id,round_id);
UPDATE screening_adjudication_cases c SET final_decision_id=(
 SELECT d.id FROM screening_final_decisions d
 WHERE d.project_id=c.project_id AND d.round_id=c.round_id AND d.source='MANUAL'
 AND d.created_at>=c.created_at AND d.created_at<=c.completed_at
 ORDER BY d.round_version DESC LIMIT 1
) WHERE c.status='COMPLETED';
