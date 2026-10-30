import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  contributionCategories,
  type AllocationPeriodView,
  type AllocationRevisionView,
  type AllocationShareInput,
  type ContributionCategoryKey,
  type ContributionMatrixCategoryInput,
} from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { useWorkspaceCommand, useWorkspaceResource } from "../hooks/use-workspace";
import { contributionsApi } from "../api/contributions.api";
import { canLeaveWorkspace, WorkspaceError, WorkspaceLoading, useUnsavedWorkspace } from "./workspace-common";
import { contributionDate as periodDate } from "../utils/contribution-date";
import { EvaluationComparison } from "./contribution-evaluation";
import {
  CONTRIBUTION_CATEGORY_META,
  basisPointsToInputString,
  computeClientContributionMatrix,
  createInitialMatrixCategories,
  formatBasisPoints,
  percentBasisPoints,
} from "../utils/contribution-percentage";

export { percentBasisPoints, formatBasisPoints, computeClientContributionMatrix } from "../utils/contribution-percentage";

export const allocationStatusLabels: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting approval",
  DISPUTED: "Disputed",
  FINALIZED: "Finalized",
  SUPERSEDED: "Superseded",
};

const evidenceStatusLabels: Record<string, string> = {
  ACCEPTED: "Acknowledged by a peer",
  SUBMITTED: "Pending acknowledgement",
  SELF_RECORDED: "Self-recorded",
  DISPUTED: "Disputed",
  CONFIRMED: "Legacy academic confirmation",
};

function PeriodEditor({ projectId, readOnly, saved, close }: { projectId: string; readOnly: boolean; saved: (period: AllocationPeriodView) => void; close: () => void }) {
  const { t } = useI18n(); const attempt = useRef<{ content: string; key: string }>(); const saving = useRef(false); const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [scope, setScope] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [openedAt] = useState(() => new Date().toISOString());
  const create = useWorkspaceCommand(projectId, () => { const input = { title, description, scope, periodStart: `${from}T00:00:00+07:00`, periodEnd: to === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(openedAt)) ? openedAt : `${to}T23:59:59.999+07:00` }; const content = JSON.stringify(input); if (attempt.current?.content !== content) attempt.current = { content, key: crypto.randomUUID() }; return contributionsApi.createPeriod(projectId, { ...input, clientKey: attempt.current.key }); });
  const [dirty, setDirty] = useState(false); useUnsavedWorkspace(dirty || create.isPending);
  async function submit(e: FormEvent) { e.preventDefault(); if (readOnly || saving.current) return; saving.current = true; try { const period = await create.mutateAsync(); setDirty(false); saved(period); } finally { saving.current = false; } }
  return <form className="contribution-editor" onChange={() => setDirty(true)} onSubmit={e => void submit(e).catch(() => undefined)}><h3>{t("Create allocation period")}</h3>
    <fieldset disabled={readOnly || create.isPending} className="contribution-editor-fields"><label>{t("Title")}<input required minLength={3} maxLength={240} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label>{t("Description")}<textarea required minLength={10} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
    <label>{t("Evaluation scope")}<textarea required minLength={10} maxLength={500} value={scope} onChange={e => setScope(e.target.value)} /></label>
    <div className="coord-form-pair"><label>{t("Period start")}<input type="date" required value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label>{t("Period end")}<input type="date" required value={to} min={from} max={periodDate()} onChange={e => setTo(e.target.value)} /></label></div>
    <p className="contribution-note">{t("Each period has its own 100%. Overlapping periods are not added together.")} UTC+7</p>
    {create.isError && <WorkspaceError error={create.error} />}</fieldset><div className="contribution-actions"><Button disabled={readOnly || create.isPending}>{t("Create period")}</Button><Button type="button" variant="ghost" disabled={create.isPending} onClick={async () => { if (!create.isPending && await canLeaveWorkspace()) close(); }}>{t("Cancel")}</Button></div></form>;
}

export function AllocationEditor({ projectId, period, draft, readOnly, close, saved }: { projectId: string; period: AllocationPeriodView; draft?: AllocationRevisionView; readOnly: boolean; close: () => void; saved: (revision: AllocationRevisionView) => void }) {
  const { t } = useI18n();
  const attempt = useRef<{ content: string; key: string }>();
  const saving = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [rationale, setRationale] = useState(draft?.rationale ?? "");
  const rosterIds = period.roster.map(p => p.id);

  const initialCategories = createInitialMatrixCategories(rosterIds, draft?.matrix);
  const [weightInputs, setWeightInputs] = useState<Record<ContributionCategoryKey, string>>(() =>
    Object.fromEntries(initialCategories.map(c => [c.category, basisPointsToInputString(c.weightBasisPoints)])) as Record<ContributionCategoryKey, string>,
  );
  const [zeroReasons, setZeroReasons] = useState<Record<ContributionCategoryKey, string>>(() =>
    Object.fromEntries(initialCategories.map(c => [c.category, c.zeroWeightReason ?? ""])) as Record<ContributionCategoryKey, string>,
  );
  const [categoryEvidence, setCategoryEvidence] = useState<Record<ContributionCategoryKey, string[]>>(() =>
    Object.fromEntries(initialCategories.map(c => [c.category, c.evidenceIds ?? []])) as Record<ContributionCategoryKey, string[]>,
  );
  const [cellInputs, setCellInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of initialCategories) {
      for (const s of c.shares) {
        map[`${c.category}:${s.userId}`] = basisPointsToInputString(s.basisPoints);
      }
    }
    return map;
  });
  const [memberReasons, setMemberReasons] = useState<Record<string, string>>(() =>
    Object.fromEntries(period.roster.map(p => [p.id, draft?.shares.find(s => s.userId === p.id)?.rationale ?? ""])),
  );
  const [evaluationSnapshotId, setEvaluationSnapshotId] = useState<string | null>(draft?.evaluationReference?.snapshotId ?? null);

  const workList = useWorkspaceResource(projectId, "allocation-matrix-evidence", () =>
    contributionsApi.work(projectId, { q: "", filter: "TEAM", page: 1, pageSize: 50 }),
  );

  const parsedCategories: ContributionMatrixCategoryInput[] = contributionCategories.map(cat => {
    const weightBp = percentBasisPoints(weightInputs[cat] ?? "");
    return {
      category: cat,
      weightBasisPoints: weightBp ?? -1,
      zeroWeightReason: zeroReasons[cat] ?? "",
      evidenceIds: categoryEvidence[cat] ?? [],
      shares: period.roster.map(p => {
        const shareBp = weightBp === 0 ? 0 : percentBasisPoints(cellInputs[`${cat}:${p.id}`] ?? "");
        return {
          userId: p.id,
          basisPoints: shareBp ?? -1,
          rationale: memberReasons[p.id] ?? "",
        };
      }),
    };
  });

  const allInputsNonNegativeIntegers = parsedCategories.every(
    c => c.weightBasisPoints >= 0 && c.shares.every(s => s.basisPoints >= 0),
  );

  const safeCategoriesForCalc: ContributionMatrixCategoryInput[] = parsedCategories.map(c => ({
    ...c,
    weightBasisPoints: Math.max(0, c.weightBasisPoints),
    shares: c.shares.map(s => ({ ...s, basisPoints: Math.max(0, s.basisPoints) })),
  }));

  const calc = computeClientContributionMatrix(rosterIds, safeCategoriesForCalc);
  const shares: AllocationShareInput[] = calc.shares.map(s => ({
    ...s,
    rationale: (memberReasons[s.userId] ?? "").trim().length >= 10 ? memberReasons[s.userId]!.trim() : s.rationale,
  }));
  const total = shares.reduce((sum, s) => sum + Math.max(0, s.basisPoints), 0);
  const validForDraft = allInputsNonNegativeIntegers && calc.totalWeightBasisPoints <= 10000 && shares.length > 0;

  const save = useWorkspaceCommand(projectId, () => {
    const matrixPayload = { categories: safeCategoriesForCalc };
    if (draft) {
      return contributionsApi.edit(projectId, draft.id, {
        shares,
        matrix: matrixPayload,
        rationale,
        expectedVersion: draft.draftVersion,
        evaluationSnapshotId,
      });
    }
    const content = JSON.stringify({ shares, matrix: matrixPayload, rationale, evaluationSnapshotId });
    if (attempt.current?.content !== content) attempt.current = { content, key: crypto.randomUUID() };
    return contributionsApi.draft(projectId, period.id, {
      shares,
      matrix: matrixPayload,
      rationale,
      evaluationSnapshotId,
      clientKey: attempt.current.key,
    });
  });

  useUnsavedWorkspace(dirty || save.isPending);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly || saving.current || !validForDraft) return;
    saving.current = true;
    try {
      const revision = await save.mutateAsync();
      setDirty(false);
      saved(revision);
    } finally {
      saving.current = false;
    }
  }

  return (
    <form className="contribution-editor" onChange={() => setDirty(true)} onSubmit={e => void submit(e).catch(() => undefined)}>
      <h3>{t(draft ? "Edit allocation draft" : "Create proposal revision")}</h3>
      <p>{period.scope}</p>
      <p className="contribution-note">
        {t("Configure category weights W(k) and member shares S(i,k). Contribution percentages C(i) = SUM[ W(k) × S(i,k) ] are calculated deterministically from agreed inputs, never from activity or task counts.")}
      </p>
      <fieldset disabled={readOnly || save.isPending} className="contribution-editor-fields">
        <fieldset className="matrix-editor-fieldset">
          <legend>{t("Contribution Matrix (4 Categories)")}</legend>
          <div className="matrix-table-wrap">
            <table className="contribution-matrix-table">
              <thead>
                <tr>
                  <th>{t("Contribution category")}</th>
                  <th>{t("Category weight W(k) (%)")}</th>
                  {period.roster.map(p => (
                    <th key={p.id}>
                      {p.name}
                      <small className="matrix-col-sub">{t("Share S(i,k) (%)")}</small>
                    </th>
                  ))}
                  <th>{t("Category share total")}</th>
                </tr>
              </thead>
              <tbody>
                {contributionCategories.map(cat => {
                  const meta = CONTRIBUTION_CATEGORY_META[cat];
                  const status = calc.categoryStatus[cat];
                  const isZeroWeight = (percentBasisPoints(weightInputs[cat] ?? "") ?? 0) === 0;
                  return (
                    <tr key={cat} data-category={cat}>
                      <td>
                        <strong>{t(meta.title)}</strong>
                        <small className="matrix-cat-examples">{t(meta.examples)}</small>
                        {isZeroWeight && (
                          <label className="matrix-zero-reason">
                            {t("Reason for 0% weight redistribution")}
                            <input
                              type="text"
                              required
                              minLength={5}
                              maxLength={1000}
                              placeholder={t("Explain why this category is not applicable")}
                              value={zeroReasons[cat] ?? ""}
                              onChange={e => setZeroReasons({ ...zeroReasons, [cat]: e.target.value })}
                            />
                          </label>
                        )}
                        {workList.data && workList.data.items.length > 0 && (
                          <details className="matrix-evidence-picker">
                            <summary>
                              {t("Supporting evidence")} ({(categoryEvidence[cat] ?? []).length})
                            </summary>
                            <div className="matrix-evidence-options">
                              {workList.data.items.map(ev => {
                                const checked = (categoryEvidence[cat] ?? []).includes(ev.id);
                                return (
                                  <label key={ev.id}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={e => {
                                        const current = categoryEvidence[cat] ?? [];
                                        const next = e.target.checked
                                          ? [...current, ev.id]
                                          : current.filter(id => id !== ev.id);
                                        setCategoryEvidence({ ...categoryEvidence, [cat]: next });
                                      }}
                                    />
                                    {ev.title} ({ev.participants.map(p => p.name).join(", ")})
                                  </label>
                                );
                              })}
                            </div>
                          </details>
                        )}
                      </td>
                      <td>
                        <input
                          required
                          inputMode="decimal"
                          aria-label={`${t("Category weight")}: ${t(meta.title)}`}
                          value={weightInputs[cat] ?? ""}
                          onChange={e => {
                            const nextVal = e.target.value;
                            setWeightInputs({ ...weightInputs, [cat]: nextVal });
                            if (percentBasisPoints(nextVal) === 0) {
                              const resetCells = { ...cellInputs };
                              for (const p of period.roster) resetCells[`${cat}:${p.id}`] = "0";
                              setCellInputs(resetCells);
                            }
                          }}
                        />
                      </td>
                      {period.roster.map(p => (
                        <td key={p.id}>
                          <input
                            required
                            inputMode="decimal"
                            disabled={isZeroWeight}
                            aria-label={`${t(meta.title)} share: ${p.name}`}
                            value={isZeroWeight ? "0" : (cellInputs[`${cat}:${p.id}`] ?? "")}
                            onChange={e =>
                              setCellInputs({
                                ...cellInputs,
                                [`${cat}:${p.id}`]: e.target.value,
                              })
                            }
                          />
                        </td>
                      ))}
                      <td data-valid={status.sharesValid}>
                        <strong>{formatBasisPoints(status.shareSumBasisPoints)}</strong>
                        {!isZeroWeight && status.shareSumBasisPoints !== 10000 && (
                          <small className="matrix-validation-hint">{t("Must equal 100%")}</small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="matrix-summary-row">
                  <td>
                    <strong>{t("Calculated contribution C(i)")}</strong>
                  </td>
                  <td data-valid={calc.weightsValid}>
                    <strong>{formatBasisPoints(calc.totalWeightBasisPoints)}</strong>
                    {calc.totalWeightBasisPoints !== 10000 && (
                      <small className="matrix-validation-hint">{t("Weights must sum to 100%")}</small>
                    )}
                  </td>
                  {period.roster.map(p => {
                    const memberTotal = calc.memberTotals.find(m => m.userId === p.id);
                    return (
                      <td key={p.id}>
                        <strong className="allocation-percent" data-testid={`matrix-total-${p.id}`}>
                          {memberTotal?.percentage ?? "0%"}
                        </strong>
                      </td>
                    );
                  })}
                  <td>
                    <strong>{formatBasisPoints(total)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t("Eligible participants & individual notes")}</legend>
          {period.roster.map(p => {
            const memberTotal = calc.memberTotals.find(m => m.userId === p.id);
            return (
              <div className="allocation-input-row" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.reasons
                      .map(r =>
                        t(
                          r === "DOCUMENTED_TEAM_WORK"
                            ? "Documented team work"
                            : r === "LEGACY_RETAINED_MEMBERSHIP"
                              ? "Retained membership; earlier history may be incomplete"
                              : "Membership during this period",
                        ),
                      )
                      .join(" · ")}
                  </small>
                  {p.unavailable && <small>{t("Account unavailable. Consent cannot be bypassed.")}</small>}
                </div>
                <div>
                  <span className="coord-muted">{t("Calculated percentage")}</span>
                  <strong className="allocation-percent">{memberTotal?.percentage ?? "0%"}</strong>
                </div>
                <label>
                  {t("Share rationale")}
                  <textarea
                    maxLength={1000}
                    placeholder={t("Optional member-specific explanation (required if 0% share)")}
                    value={memberReasons[p.id] ?? ""}
                    onChange={e => setMemberReasons({ ...memberReasons, [p.id]: e.target.value })}
                  />
                </label>
              </div>
            );
          })}
        </fieldset>

        <EvaluationComparison
          projectId={projectId}
          periodId={period.id}
          shares={shares}
          selectedId={evaluationSnapshotId}
          select={id => {
            setEvaluationSnapshotId(id);
            setDirty(true);
          }}
        />
        <p role="status">
          {t("Total")}: {(total / 100).toFixed(2)}% ({formatBasisPoints(total)}){" "}
          {(!calc.isCompleteAndValid || total !== 10000) && t("Must total exactly 100% before submission")}
        </p>
        <label>
          {t("Proposal rationale")}
          <textarea
            required
            minLength={20}
            maxLength={5000}
            rows={4}
            value={rationale}
            onChange={e => setRationale(e.target.value)}
          />
        </label>
        <p className="contribution-note">
          {t("Zero-percent participants remain in the roster and must approve. Explain every zero share.")}
        </p>
        {save.isError && <WorkspaceError error={save.error} />}
      </fieldset>
      <div className="contribution-actions">
        <Button disabled={readOnly || save.isPending || !validForDraft}>{t("Save draft")}</Button>
        <Button
          type="button"
          variant="ghost"
          disabled={save.isPending}
          onClick={async () => {
            if (!save.isPending && (await canLeaveWorkspace())) close();
          }}
        >
          {t("Cancel")}
        </Button>
      </div>
    </form>
  );
}

export function AllocationRevisionDetail({
  projectId,
  item,
  readOnly = false,
  edit,
  revised,
  onOpenEvidenceTab,
}: {
  projectId: string;
  item: AllocationRevisionView;
  readOnly?: boolean;
  edit?: () => void;
  revised?: () => void;
  onOpenEvidenceTab?: () => void;
}) {
  const { t } = useI18n();
  const [explanation, setExplanation] = useState("");
  const [exportError, setExportError] = useState<unknown>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const matrixCheck = item.matrix
    ? computeClientContributionMatrix(
        item.roster.map(p => p.id),
        item.matrix.categories,
      )
    : null;

  const canSubmit =
    item.roster.length > 0
    && item.shares.length === item.roster.length
    && new Set(item.shares.map(s => s.userId)).size === item.roster.length
    && item.roster.every(p => item.shares.some(s => s.userId === p.id))
    && item.shares.every(
      s =>
        Number.isInteger(s.basisPoints)
        && s.basisPoints >= 0
        && s.basisPoints <= 10000
        && (s.basisPoints !== 0 || s.rationale.trim().length >= 10),
    )
    && item.shares.reduce((total, s) => total + s.basisPoints, 0) === 10000
    && item.rationale.trim().length >= 20
    && (!matrixCheck || matrixCheck.isCompleteAndValid);

  const submit = useWorkspaceCommand(projectId, () => contributionsApi.submitDraft(projectId, item.id, item.draftVersion));
  const decide = useWorkspaceCommand(projectId, (decision: "APPROVE" | "DISPUTE") =>
    contributionsApi.decide(projectId, item.id, decision, decision === "DISPUTE" ? explanation : ""),
  );
  const challenge = useWorkspaceCommand(projectId, () =>
    contributionsApi.challenge(projectId, item.period.id, item.id, explanation),
  );
  useUnsavedWorkspace(Boolean(explanation.trim()) || decide.isPending || challenge.isPending);

  async function download() {
    try {
      const data = await contributionsApi.export(projectId, item.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `allocation-v${item.revision}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error);
    }
  }

  const disputes = item.approvals.filter(a => a.decision === "DISPUTE");
  const selectedMember = item.roster.find(p => p.id === selectedMemberId) ?? null;

  return (
    <article className="contribution-detail" data-allocation-status={item.status}>
      <header>
        <h3>
          {item.period.title} · v{item.revision}
        </h3>
        <Badge variant={["FINALIZED", "SUPERSEDED"].includes(item.status) ? "secondary" : "outline"}>
          {t(allocationStatusLabels[item.status]!)}
        </Badge>
        {item.status !== "FINALIZED" && item.status !== "SUPERSEDED" && (
          <Badge variant="outline" className="coord-status-provisional">
            {t("Provisional allocation")}
          </Badge>
        )}
      </header>
      <p>
        {periodDate(item.period.periodStart)} → {periodDate(item.period.periodEnd)}
      </p>
      <p className="contribution-prose">{item.period.scope}</p>
      <p className="contribution-note">
        {t(
          "Team-agreed effort distribution for this scope. This does not set grades, legal rights, authorship eligibility, author order or scientific quality.",
        )}
      </p>
      {item.status !== "FINALIZED" && item.status !== "SUPERSEDED" && (
        <p role="status">
          {t("This proposal has not been approved by every participant.")}{" "}
          {t("Unconfirmed percentages are provisional and are not official results.")}
        </p>
      )}
      {item.selfAcknowledged && (
        <p>{t("Single-participant result: self-acknowledged, without independent peer approval.")}</p>
      )}

      {item.matrix && (
        <section className="contribution-matrix-section" aria-label={t("Four category-level allocations")}>
          <h4>{t("Contribution Matrix Breakdown")}</h4>
          <div className="matrix-table-wrap">
            <table className="contribution-matrix-table">
              <thead>
                <tr>
                  <th>{t("Category")}</th>
                  <th>{t("Weight W(k)")}</th>
                  {item.roster.map(p => (
                    <th key={p.id}>{p.name}</th>
                  ))}
                  <th>{t("Supporting evidence")}</th>
                </tr>
              </thead>
              <tbody>
                {item.matrix.categories.map(cat => {
                  const meta = CONTRIBUTION_CATEGORY_META[cat.category];
                  const linkedEvidence = item.evidenceSummary.filter(
                    ev => cat.evidenceIds.includes(ev.id) || ev.category === cat.category,
                  );
                  return (
                    <tr key={cat.category}>
                      <td>
                        <strong>{t(meta?.title ?? cat.category)}</strong>
                        {cat.weightBasisPoints === 0 && cat.zeroWeightReason && (
                          <small className="matrix-cat-examples">
                            {t("0% weight reason")}: {cat.zeroWeightReason}
                          </small>
                        )}
                      </td>
                      <td>{formatBasisPoints(cat.weightBasisPoints)}</td>
                      {item.roster.map(p => {
                        const s = cat.shares.find(sh => sh.userId === p.id);
                        const shareBp = s?.basisPoints ?? 0;
                        const weightedBp = Math.round((cat.weightBasisPoints * shareBp) / 10000);
                        return (
                          <td key={p.id}>
                            <span>{formatBasisPoints(shareBp)}</span>
                            {cat.weightBasisPoints > 0 && (
                              <small className="matrix-weighted-note">
                                ({formatBasisPoints(weightedBp)})
                              </small>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        {linkedEvidence.length > 0
                          ? linkedEvidence.map(ev => ev.title).join(", ")
                          : t("General period evidence")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="matrix-summary-row">
                  <td>
                    <strong>{t("Agreed total C(i)")}</strong>
                  </td>
                  <td>100%</td>
                  {item.roster.map(p => {
                    const memberTotal = item.matrix?.memberTotals.find(m => m.userId === p.id);
                    const flatShare = item.shares.find(s => s.userId === p.id);
                    const bp = memberTotal?.basisPoints ?? flatShare?.basisPoints ?? 0;
                    return (
                      <td key={p.id}>
                        <strong>{formatBasisPoints(bp)}</strong>
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <h4>{t("Member shares & confirmation status")}</h4>
      <ul className="allocation-shares">
        {item.roster.map(p => {
          const share = item.shares.find(s => s.userId === p.id);
          const decision = item.approvals.find(a => a.userId === p.id);
          const bp = share?.basisPoints ?? 0;
          return (
            <li key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <p>{share?.rationale}</p>
                <small>
                  {p.reasons
                    .map(r =>
                      t(
                        r === "DOCUMENTED_TEAM_WORK"
                          ? "Documented team work"
                          : r === "LEGACY_RETAINED_MEMBERSHIP"
                            ? "Retained membership; earlier history may be incomplete"
                            : "Membership during this period",
                      ),
                    )
                    .join(" · ")}
                </small>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedMemberId(selectedMemberId === p.id ? null : p.id)}
                  >
                    {t(selectedMemberId === p.id ? "Hide member detail" : "Inspect member detail")}
                  </Button>
                </div>
              </div>
              <strong className="allocation-percent" title={`${(bp / 100).toFixed(2)}%`}>
                {formatBasisPoints(bp)} ({(bp / 100).toFixed(2)}%)
              </strong>
              <div>
                <Badge variant="outline">
                  {t(
                    decision?.decision === "APPROVE"
                      ? "Approved"
                      : decision?.decision === "DISPUTE"
                        ? "Changes requested"
                        : "Awaiting response",
                  )}
                </Badge>
                {decision && (
                  <>
                    <p className="contribution-prose">{decision.explanation}</p>
                    <time>{new Date(decision.createdAt).toLocaleString()}</time>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {selectedMember && (
        <section className="member-contribution-detail" aria-label={`${t("Member detail")}: ${selectedMember.name}`}>
          <header className="coord-row-between">
            <h4>
              {t("Member contribution detail")}: {selectedMember.name}
            </h4>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedMemberId(null)}>
              {t("Close")}
            </Button>
          </header>
          <p>
            <strong>{t("Calculated percentage")}:</strong>{" "}
            {formatBasisPoints(item.shares.find(s => s.userId === selectedMember.id)?.basisPoints ?? 0)}
          </p>
          {item.matrix && (
            <div>
              <h5>{t("Breakdown by category")}</h5>
              <ul>
                {item.matrix.categories.map(cat => {
                  const s = cat.shares.find(sh => sh.userId === selectedMember.id);
                  const weightedBp = Math.round((cat.weightBasisPoints * (s?.basisPoints ?? 0)) / 10000);
                  return (
                    <li key={cat.category}>
                      <strong>{t(CONTRIBUTION_CATEGORY_META[cat.category]?.title ?? cat.category)}:</strong>{" "}
                      {formatBasisPoints(cat.weightBasisPoints)} × {formatBasisPoints(s?.basisPoints ?? 0)} ={" "}
                      <strong>{formatBasisPoints(weightedBp)}</strong>
                      {s?.rationale ? ` — ${s.rationale}` : ""}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div>
            <h5>{t("Supporting research artifacts & verification status")}</h5>
            {item.evidenceSummary.filter(e => e.participants.includes(selectedMember.id)).length === 0 ? (
              <p className="contribution-note">{t("No member-specific evidence records linked in this period.")}</p>
            ) : (
              <ul>
                {item.evidenceSummary
                  .filter(e => e.participants.includes(selectedMember.id))
                  .map(e => (
                    <li key={e.id}>
                      <strong>{e.title}</strong>
                      {e.category && ` · ${t(CONTRIBUTION_CATEGORY_META[e.category]?.title ?? e.category)}`} ·{" "}
                      <Badge variant="outline">{t(evidenceStatusLabels[e.status] ?? e.status)}</Badge>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div>
            <h5>{t("Confirmation & dispute history")}</h5>
            {item.approvals.filter(a => a.userId === selectedMember.id).length === 0 ? (
              <p className="contribution-note">{t("Awaiting member confirmation for v")}{item.revision}.</p>
            ) : (
              <ul>
                {item.approvals
                  .filter(a => a.userId === selectedMember.id)
                  .map((a, idx) => (
                    <li key={idx}>
                      <strong>{t(a.decision === "APPROVE" ? "Confirmed" : "Disputed")}</strong>
                      {a.explanation ? `: ${a.explanation}` : ""} ·{" "}
                      <time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString()}</time>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <p>
        {t("Total")}: {(item.shares.reduce((total, s) => total + s.basisPoints, 0) / 100).toFixed(2)}%
      </p>
      <h4>{t("Proposal rationale")}</h4>
      <p className="contribution-prose">{item.rationale}</p>

      <h4>{t("Contribution summaries shared for this proposal")}</h4>
      <ul>
        {item.evidenceSummary.map(e => (
          <li key={e.id}>
            {e.title}
            {e.category ? ` (${t(CONTRIBUTION_CATEGORY_META[e.category]?.title ?? e.category)})` : ""} ·{" "}
            {t(evidenceStatusLabels[e.status] ?? e.status)} ·{" "}
            {e.participants.map(id => item.roster.find(p => p.id === id)?.name ?? t("Contributor")).join(", ")}
          </li>
        ))}
      </ul>

      {(disputes.length > 0 || item.rosterChallenges.length > 0) && (
        <section className="allocation-disputes-section" aria-label={t("Unresolved disputes")}>
          <h4>{t("Disputes & requested corrections")}</h4>
          <p className="contribution-note">
            {t("Disagreements are never resolved by majority vote or leader override. Revise the proposal so all affected members can confirm.")}
          </p>
          <ul>
            {disputes.map((d, idx) => (
              <li key={`${d.userId}:${idx}`}>
                <strong>{item.roster.find(p => p.id === d.userId)?.name ?? t("Member")}:</strong> {d.explanation} ·{" "}
                <time dateTime={d.createdAt}>{d.createdAt.slice(0, 10)}</time>
              </li>
            ))}
            {item.rosterChallenges.map((c, i) => (
              <li key={`${c.userId}:challenge:${i}`} className="contribution-prose">
                {t("Roster challenge")}: {c.explanation} · {c.createdAt.slice(0, 10)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.evaluationReference && (
        <section>
          <h4>{t("Evaluation snapshot")}</h4>
          <p>
            {t("Rule version")}: {item.evaluationReference.ruleVersion} ·{" "}
            {new Date(item.evaluationReference.calculatedAt).toLocaleString()}
          </p>
          <ul>
            {item.evaluationReference.differences.map(d => (
              <li key={d.userId}>
                {item.roster.find(p => p.id === d.userId)?.name}: {t("Suggested percentage")}{" "}
                {(d.suggestedBasisPoints / 100).toFixed(2)}% → {t("Proposed percentage")}{" "}
                {(d.proposedBasisPoints / 100).toFixed(2)}%<p>{d.rationale}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="contribution-note">
        {t("Submitted content and decisions are immutable. Every revised proposal requires new approvals.")}
      </p>
      {item.proposedBy && (
        <p>
          {t("Proposed by")}: <strong>{item.proposedBy.name}</strong>
        </p>
      )}
      {item.finalizedAt && (
        <p>
          {t("Finalized at")}: <time dateTime={item.finalizedAt}>{new Date(item.finalizedAt).toLocaleString()}</time>
          {item.finalizedBy ? ` · ${t("Finalized by")}: ${item.finalizedBy.name}` : ""}
        </p>
      )}

      {!readOnly && item.canManage && item.status === "DRAFT" && (
        <>
          <div className="contribution-actions">
            {edit && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (await canLeaveWorkspace()) edit?.();
                }}
              >
                {t("Edit draft")}
              </Button>
            )}
            <Button disabled={submit.isPending || !canSubmit} onClick={() => submit.mutate()}>
              {t("Submit proposal")}
            </Button>
          </div>
          {!canSubmit && (
            <p role="status">
              {t("Complete the roster, total exactly 100%, and explain the proposal and any zero share before submission.")}
            </p>
          )}
        </>
      )}
      {!readOnly && item.canManage && ["DISPUTED", "FINALIZED"].includes(item.status) && revised && (
        <Button
          variant="outline"
          onClick={async () => {
            if (await canLeaveWorkspace()) revised?.();
          }}
        >
          {t("Create proposal revision")}
        </Button>
      )}
      {!readOnly && item.canRespond && (
        <div className="contribution-response">
          <Button disabled={decide.isPending} onClick={() => decide.mutate("APPROVE", { onSuccess: () => setExplanation("") })}>
            {t("Approve this exact revision")}
          </Button>
          <label>
            {t("Explanation for requested changes")}
            <textarea
              value={explanation}
              disabled={decide.isPending || challenge.isPending}
              maxLength={2000}
              onChange={e => setExplanation(e.target.value)}
            />
          </label>
          <div className="contribution-actions">
            <Button
              variant="outline"
              disabled={decide.isPending || explanation.trim().length < 10}
              onClick={() => decide.mutate("DISPUTE", { onSuccess: () => setExplanation("") })}
            >
              {t("Request changes")}
            </Button>
            {onOpenEvidenceTab && (
              <Button type="button" variant="ghost" onClick={onOpenEvidenceTab}>
                {t("Submit additional evidence")}
              </Button>
            )}
          </div>
        </div>
      )}
      {!readOnly && item.canChallengeRoster && (
        <div className="contribution-response">
          <label>
            {t("Roster challenge")}
            <textarea
              value={explanation}
              disabled={decide.isPending || challenge.isPending}
              maxLength={2000}
              onChange={e => setExplanation(e.target.value)}
            />
          </label>
          <Button
            variant="outline"
            disabled={challenge.isPending || explanation.trim().length < 10}
            onClick={() => challenge.mutate(undefined, { onSuccess: () => setExplanation("") })}
          >
            {t("Challenge participant roster")}
          </Button>
        </div>
      )}
      {["FINALIZED", "SUPERSEDED"].includes(item.status) && (
        <Button variant="outline" onClick={() => void download()}>
          {t("Export agreed allocation")}
        </Button>
      )}
      {(submit.isError || decide.isError || challenge.isError || Boolean(exportError)) && (
        <WorkspaceError error={submit.error ?? decide.error ?? challenge.error ?? exportError} />
      )}
    </article>
  );
}

export function ContributionAllocationPanel({
  projectId,
  isOwner,
  readOnly,
  onOpenEvidenceTab,
}: {
  projectId: string;
  isOwner: boolean;
  readOnly: boolean;
  onOpenEvidenceTab?: () => void;
}) {
  const { t } = useI18n();
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [newPeriod, setNewPeriod] = useState(false);
  const [editing, setEditing] = useState<"new" | AllocationRevisionView | null>(null);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const periods = useWorkspaceResource(projectId, "allocation-periods", () => contributionsApi.periods(projectId));
  const selectedPeriod = periodId ?? periods.data?.[0]?.id;
  const history = useWorkspaceResource(
    projectId,
    "allocation-history",
    () => contributionsApi.history(projectId, selectedPeriod!),
    selectedPeriod,
    Boolean(selectedPeriod),
  );
  const period = periods.data?.find(p => p.id === selectedPeriod);
  const selected = history.data?.find(r => r.id === revisionId) ?? history.data?.[0];

  if (newPeriod)
    return (
      <PeriodEditor
        projectId={projectId}
        readOnly={readOnly || !isOwner}
        close={() => setNewPeriod(false)}
        saved={p => {
          setPeriodId(p.id);
          setNewPeriod(false);
        }}
      />
    );
  if (editing && period)
    return (
      <AllocationEditor
        key={typeof editing === "string" ? selectedPeriod : `${editing.id}:${editing.draftVersion}`}
        projectId={projectId}
        period={period}
        draft={typeof editing === "string" ? undefined : editing}
        readOnly={readOnly || !isOwner}
        close={() => setEditing(null)}
        saved={r => {
          setRevisionId(r.id);
          setEditing(null);
        }}
      />
    );

  return (
    <div className="contribution-section">
      <p className="contribution-note">
        {t("Each period has its own 100%. Overlapping periods are not added together.")}
      </p>
      <div className="contribution-filters">
        <label>
          {t("Allocation period")}
          <select
            value={selectedPeriod ?? ""}
            onChange={async e => {
              const value = e.target.value;
              if (await canLeaveWorkspace()) {
                setPeriodId(value);
                setRevisionId(null);
              }
            }}
          >
            <option value="" disabled>
              {t("Choose a period")}
            </option>
            {periods.data?.map(p => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        {isOwner && !readOnly && (
          <Button
            onClick={async () => {
              if (await canLeaveWorkspace()) setNewPeriod(true);
            }}
          >
            {t("Create allocation period")}
          </Button>
        )}
        {onOpenEvidenceTab && (
          <Button type="button" variant="outline" onClick={onOpenEvidenceTab}>
            {t("Collect & review supporting evidence")}
          </Button>
        )}
      </div>
      {periods.isLoading || (history.isLoading && selectedPeriod) ? (
        <WorkspaceLoading />
      ) : periods.isError || history.isError ? (
        <WorkspaceError
          error={periods.error ?? history.error}
          retry={() => {
            void periods.refetch();
            void history.refetch();
          }}
        />
      ) : !period ? (
        <p className="contribution-empty">
          {t("The owner can define an evaluation scope, review eligible participants and propose effort shares.")}
        </p>
      ) : (
        <>
          <h3>{t("Eligible participants")}</h3>
          <p>{period.scope}</p>
          <p>
            {t("Policy")}: {period.policyVersion}
          </p>
          <ul>
            {period.roster.map(p => (
              <li key={p.id}>
                {p.name} ·{" "}
                {t(p.reasons.includes("DOCUMENTED_TEAM_WORK") ? "Documented team work" : "Membership during this period")}
                {p.unavailable && ` · ${t("Account unavailable. Consent cannot be bypassed.")}`}
              </li>
            ))}
          </ul>
          {period.historyIncomplete && (
            <p className="contribution-note">
              {t("Earlier membership history may be incomplete. Challenge omissions before agreement.")}
            </p>
          )}
          {!selected && isOwner && !readOnly && (
            <Button onClick={() => setEditing("new")}>{t("Create allocation draft")}</Button>
          )}
          {selected && (
            <>
              <label>
                {t("Allocation history")}
                <select
                  value={selected.id}
                  onChange={async e => {
                    const value = e.target.value;
                    if (await canLeaveWorkspace()) setRevisionId(value);
                  }}
                >
                  {history.data?.map(r => (
                    <option key={r.id} value={r.id}>
                      v{r.revision} · {t(allocationStatusLabels[r.status]!)}
                    </option>
                  ))}
                </select>
              </label>
              <AllocationRevisionDetail
                key={selected.id}
                projectId={projectId}
                item={selected}
                readOnly={readOnly}
                edit={isOwner ? () => setEditing(selected) : undefined}
                revised={isOwner ? () => setEditing("new") : undefined}
                onOpenEvidenceTab={onOpenEvidenceTab}
              />
              <Link
                className="coord-inline-link"
                to={`/projects/${encodeURIComponent(projectId)}/allocation?revision=${selected.id}`}
              >
                {t("Open restricted allocation review")}
              </Link>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function ScopedAllocationPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const revisionId = params.get("revision");
  const periodId = params.get("period");
  const revision = useWorkspaceResource(
    projectId,
    "scoped-allocation",
    () => contributionsApi.revision(projectId, revisionId!),
    revisionId,
    Boolean(revisionId),
  );
  const history = useWorkspaceResource(
    projectId,
    "scoped-allocation-history",
    () => contributionsApi.history(projectId, periodId ?? revision.data!.period.id),
    periodId ?? revision.data?.period.id,
    Boolean(periodId || revision.data),
  );
  if (!revisionId && !periodId)
    return <p>{t("Open the allocation link from your notification to review your proposed share.")}</p>;
  return (
    <section className="contribution-section">
      <h1>{t("Allocation review")}</h1>
      <p className="contribution-note">
        {t("This restricted view shares the allocation agreement only. Project documents require separate membership.")}
      </p>
      {revision.isLoading || history.isLoading ? (
        <WorkspaceLoading />
      ) : revision.isError || history.isError ? (
        <WorkspaceError
          error={revision.error ?? history.error}
          retry={() => {
            void revision.refetch();
            void history.refetch();
          }}
        />
      ) : (
        <>
          <label>
            {t("Allocation history")}
            <select
              value={revisionId ?? history.data?.[0]?.id ?? ""}
              onChange={async e => {
                const value = e.target.value;
                if (await canLeaveWorkspace()) setParams({ revision: value });
              }}
            >
              {history.data?.map(r => (
                <option key={r.id} value={r.id}>
                  v{r.revision} · {t(allocationStatusLabels[r.status]!)}
                </option>
              ))}
            </select>
          </label>
          {(revision.data ?? history.data?.[0]) && (
            <AllocationRevisionDetail
              key={(revision.data ?? history.data![0])!.id}
              projectId={projectId}
              item={(revision.data ?? history.data![0])!}
            />
          )}
        </>
      )}
    </section>
  );
}
