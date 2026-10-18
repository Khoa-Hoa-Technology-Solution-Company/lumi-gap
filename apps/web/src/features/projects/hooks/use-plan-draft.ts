import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import type { PlanDraftUpdate, ResearchPlanContent, ResearchPlanView } from "@trend/shared-types";
import { workspaceApi } from "../api/workspace.api";
import { useUnsavedWorkspace } from "../components/workspace-common";

type Field = keyof ResearchPlanContent;
type Model = { draft: ResearchPlanContent; base: ResearchPlanContent; version: number };
type Conflict = { latest: ResearchPlanView; fields: Field[] };
// Survives a sign-in redirect in this tab, never written to browser storage.
// Only the original account and project can recover an expired-session edit.
const sessionRecovery = new Map<string, { model: Model; expiresAt: number }>();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const planFields = ["approach", "problem", "objectives", "questions", "scope", "methodology", "searchStrategy", "deliverables", "inclusionCriteria", "exclusionCriteria"] as const;
export function normalizePlan(content: ResearchPlanContent): ResearchPlanContent {
  const list = (values: string[]) => values.map(value => value.trim()).filter(Boolean);
  return { ...content, problem: content.problem.trim(), scope: content.scope.trim(), methodology: content.methodology.trim(), searchStrategy: content.searchStrategy.trim(), objectives: list(content.objectives), deliverables: list(content.deliverables), inclusionCriteria: list(content.inclusionCriteria), exclusionCriteria: list(content.exclusionCriteria), questions: content.questions.filter(q => q.text.trim()).map(q => ({ ...q, text: q.text.trim() })) };
}
export function validPlan(content: ResearchPlanContent) {
  return content.problem.length <= 5000 && content.scope.length <= 5000 && content.methodology.length <= 20000 && content.searchStrategy.length <= 5000 && [content.objectives, content.deliverables].every(values => values.length <= 20 && values.every(value => value.length <= 500)) && [content.inclusionCriteria, content.exclusionCriteria].every(values => values.length <= 20 && values.every(value => value.length <= 240)) && content.questions.length <= 20 && content.questions.every(q => q.text.length <= 1000);
}

export function usePlanDraft(projectId: string, view: ResearchPlanView) {
  const cache = useQueryClient();
  const userId = useAuthStore(state => state.user?.id);
  const recovered = useRef(false);
  const [model, setModel] = useState<Model>(() => {
    const key = `${userId}:${projectId}`, pending = sessionRecovery.get(key);
    if (view.canEdit && pending) {
      sessionRecovery.delete(key);
      if (pending.expiresAt > Date.now()) { recovered.current = true; return pending.model; }
    }
    return { draft: view.content, base: view.content, version: view.version };
  });
  const current = useRef(model), writable = useRef(view.canEdit);
  writable.current = view.canEdit;
  const [saving, setSaving] = useState(false), [error, setError] = useState<unknown>(null), [conflict, setConflict] = useState<Conflict | null>(null);
  const flight = useRef<Promise<boolean> | null>(null);
  const attempt = useRef<{ input: PlanDraftUpdate; raw: ResearchPlanContent } | null>(null);
  const commit = useCallback((next: Model) => { current.current = next; setModel(next); }, []);
  const dirty = !same(normalizePlan(model.draft), normalizePlan(model.base));
  const valid = validPlan(normalizePlan(model.draft));
  useUnsavedWorkspace(dirty || saving || Boolean(attempt.current));
  const invalidate = useCallback(() => {
    void cache.invalidateQueries({ queryKey: ["project-workspace", userId, projectId] });
    void cache.invalidateQueries({ queryKey: ["project-research", userId, projectId] });
    void cache.invalidateQueries({ queryKey: ["project", projectId] });
  }, [cache, projectId, userId]);

  const saveOnce = useCallback((): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (!writable.current) return Promise.resolve(false);
    const state = current.current, normalized = normalizePlan(state.draft);
    if (!validPlan(normalized)) return Promise.resolve(false);
    if (!attempt.current) {
      const keys = planFields.filter(key => !same(normalized[key], normalizePlan(state.base)[key]));
      if (!keys.length) return Promise.resolve(true);
      attempt.current = { input: { expectedVersion: state.version, clientKey: crypto.randomUUID(), base: Object.fromEntries(keys.map(key => [key, state.base[key]])), changes: Object.fromEntries(keys.map(key => [key, normalized[key]])) }, raw: state.draft };
    }
    const sent = attempt.current;
    setSaving(true); setError(null);
    flight.current = (async () => {
      try {
        const result = await workspaceApi.updatePlanDraft(projectId, sent.input);
        // Only adopt acknowledged fields if the user has not typed newer text while the request was pending.
        const draft = { ...current.current.draft };
        for (const key of planFields) if (same(draft[key], sent.raw[key]) && !same(normalizePlan(sent.raw)[key], result.content[key])) Object.assign(draft, { [key]: result.content[key] });
        commit({ draft, base: result.content, version: result.version });
        attempt.current = null; setConflict(null); invalidate();
        return true;
      } catch (failure) {
        setError(failure);
        const response = (failure as { response?: { status?: number; data?: { error?: { details?: { fields?: Field[] } } } } }).response;
        if (response?.status === 401 && userId) {
          for (const [key, pending] of sessionRecovery) if (pending.expiresAt <= Date.now()) sessionRecovery.delete(key);
          if (sessionRecovery.size >= 10) sessionRecovery.delete(sessionRecovery.keys().next().value!);
          sessionRecovery.set(`${userId}:${projectId}`, { model: current.current, expiresAt: Date.now() + 30 * 60 * 1000 });
        }
        if (response && response.status && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
          attempt.current = null; // The server rejected this write; a later corrected edit gets a new request key.
          if (response.status === 409 && response.data?.error?.details?.fields?.length) {
            try { const latest = await workspaceApi.plan(projectId); setConflict({ latest, fields: response.data.error.details.fields }); } catch { /* Keep input and expose the original failure. */ }
          }
        }
        // For an uncertain network outcome retain the exact request/key until it is acknowledged.
        return false;
      } finally { flight.current = null; setSaving(false); }
    })();
    return flight.current;
  }, [commit, invalidate, projectId, userId]);

  useEffect(() => {
    if (!dirty || saving || error || conflict || !valid || !view.canEdit) return;
    const timer = window.setTimeout(() => { void saveOnce(); }, 900);
    return () => window.clearTimeout(timer);
  }, [dirty, model.draft, saving, error, conflict, valid, view.canEdit, saveOnce]);
  useEffect(() => {
    if (view.version > current.current.version && !flight.current && !attempt.current && same(normalizePlan(current.current.draft), normalizePlan(current.current.base))) commit({ draft: view.content, base: view.content, version: view.version });
  }, [view, commit]);

  function field<K extends Field>(key: K, value: ResearchPlanContent[K]) {
    commit({ ...current.current, draft: { ...current.current.draft, [key]: value } });
    if (!attempt.current && !conflict) setError(null);
  }
  async function flush() {
    if (conflict || error || !valid) return false;
    do { if (!await saveOnce()) return false; } while (!same(normalizePlan(current.current.draft), normalizePlan(current.current.base)));
    return true;
  }
  function reconcile(choices: Partial<Record<Field, "mine" | "server">>) {
    if (!conflict || conflict.fields.some(key => !choices[key])) return;
    const latest = conflict.latest, local = current.current, draft = { ...latest.content };
    for (const key of planFields) if (!same(normalizePlan(local.draft)[key], normalizePlan(local.base)[key]) && choices[key] !== "server") Object.assign(draft, { [key]: local.draft[key] });
    attempt.current = null; commit({ draft, base: latest.content, version: latest.version }); setConflict(null); setError(null);
  }
  return { ...model, recovered: recovered.current, dirty, saving, error, conflict, valid, field, flush, retry: saveOnce, reconcile, invalidate, current };
}
