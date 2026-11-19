-- Protect source/run provenance even if a future writer forgets application-level scoping.
ALTER TABLE draft_workspaces ADD CONSTRAINT draft_workspaces_integrity_scope UNIQUE(id,project_id);
ALTER TABLE ai_runs ADD CONSTRAINT ai_runs_integrity_owner_scope UNIQUE(id,project_id,workspace_id,owner_id);
ALTER TABLE manuscript_ai_acceptances ADD CONSTRAINT manuscript_ai_acceptance_workspace_scope_fk
 FOREIGN KEY(workspace_id,project_id) REFERENCES draft_workspaces(id,project_id);
ALTER TABLE manuscript_ai_acceptances ADD CONSTRAINT manuscript_ai_acceptance_run_scope_fk
 FOREIGN KEY(run_id,project_id,workspace_id,accepted_by_id) REFERENCES ai_runs(id,project_id,workspace_id,owner_id);
