// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ManuscriptIntegrityPage } from "../manuscript-integrity";
import type { IntegrityReadiness, IntegrityStoredRecord } from "@trend/shared-types";
const mocks = vi.hoisted(() => ({ overview: vi.fn(), command: vi.fn(), packet: vi.fn(), export: vi.fn(), snapshots: vi.fn(), canLeave: vi.fn().mockResolvedValue(true) }));
vi.mock('../manuscript-integrity.api', () => ({ manuscriptIntegrityApi: mocks }));
vi.mock('../manuscripts.api', () => ({ manuscriptsApi: { snapshots: mocks.snapshots }, saveDownload: vi.fn() }));
vi.mock('../components/manuscript-attribution-dialog', () => ({ ManuscriptAttributionDialog: () => <button>Existing attribution workflow</button> }));
vi.mock('@/features/projects/components/workspace-common', () => ({ useUnsavedWorkspace: () => {}, canLeaveWorkspace: mocks.canLeave }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")) }) }));
vi.mock('@/stores/auth-store', () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: 'public-actor' } }) }));
let root: Root, host: HTMLDivElement, client: QueryClient, data: IntegrityReadiness;
const record = (kind: IntegrityStoredRecord['kind'], content: unknown = {}): IntegrityStoredRecord => ({ id: kind, kind, content, version: 1, createdById: 'actor', createdAt: '2026-11-06T00:00:00Z', evidenceDigest: 'digest', checksum: 'checksum', acknowledgedBy: [] });
const base = (): IntegrityReadiness => ({
  schemaVersion: 'LUMIGAP_INTEGRITY_V1', algorithmVersion: 'READINESS_V1', projectId: 'project', manuscriptId: 'manuscript', snapshotId: 'snapshot', snapshotVersion: 3, snapshotChecksum: 'snapshot-checksum', viewerId: 'actor', evaluatedAt: '2026-11-06T00:00:00Z', evidenceDigest: 'digest', state: 'PENDING', maySubmit: false, currentSnapshot: true,
  policy: { requireAiAcknowledgement: false, requireRightsAcknowledgement: false, requireCitationAudit: false, requireCurrentSnapshot: false, reason: 'Advisory policy' }, checks: [{ area: 'AUTHORSHIP', state: 'PENDING', blocking: true, reason: 'Author consent is missing', href: '/existing-authorship' }], evidenceVersions: {},
  authorship: { proposedAuthors: [], snapshotLabel: 'Saved study' } as unknown as IntegrityReadiness['authorship'], citations: null, aiOperations: [], legacyExternalAi: [], mentors: [], cases: [], records: {}, history: [], permissions: { canManagePolicy: true, canDeclareRights: true, canWrite: true, canExport: true, canAcknowledge: true }, notice: 'Checks do not certify scientific correctness or legal ownership.',
});
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.startsWith(text))!;
const field = (text: string) => [...document.querySelectorAll('label')].find(label => label.textContent?.startsWith(text))!.querySelector('textarea,input,select') as HTMLTextAreaElement;
async function type(label: string, value: string) { const element = field(label); await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); }); }
beforeEach(() => {
  vi.resetAllMocks(); mocks.canLeave.mockResolvedValue(true); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); data = base();
  mocks.snapshots.mockResolvedValue([{ id: 'snapshot', label: 'Saved study', sourceVersion: 3 }]); mocks.overview.mockImplementation(async () => data); mocks.command.mockResolvedValue(record('CITATION_AUDIT'));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function mount(suffix = '') {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/projects/project/manuscripts/manuscript/integrity${suffix}`]}><Routes><Route path="/projects/:projectId/manuscripts/:id/integrity" element={<ManuscriptIntegrityPage />} /></Routes></MemoryRouter></QueryClientProvider>)); await tick(); await tick();
}
async function tab(label: string) { await act(async () => button(label).click()); await tick(); }
it('selects a real saved snapshot and separates evidence completeness from scientific certification', async () => {
  await mount(); expect(mocks.overview).toHaveBeenCalledWith('project', 'manuscript', 'snapshot'); expect(host.textContent).toContain('Author consent is missing'); expect(host.textContent).toContain('Blocks internal submission'); expect(host.textContent).not.toContain('100%');
});
it('clearly identifies a historical snapshot and offers the existing attribution workflow', async () => {
  data.currentSnapshot = false; data.state = 'STALE'; await mount(); expect(host.textContent).toContain('The working manuscript has changed'); await tab('Authorship and contributions'); expect(button('Existing attribution workflow')).toBeDefined();
});
it('runs citation analysis through the actual API command rather than presenting mock success', async () => {
  await mount(); await tab('Citation audit'); await act(async () => button('Analyze saved citations').click()); await tick(); expect(mocks.command).toHaveBeenCalledWith('project', 'manuscript', 'snapshot', expect.objectContaining({ kind: 'CITATION_AUDIT', clientKey: expect.any(String) }));
});
it('retains a typed AI declaration on failure and does not silently overwrite a newer declaration', async () => {
  await mount(); await tab('AI disclosure'); await type('AI disclosure wording', 'Authors reviewed all language assistance.');
  data = { ...data, records: { AI_DECLARATION: record('AI_DECLARATION', { disclosure: 'Another member updated the declaration', venuePolicy: '', externalUsage: [] }) } };
  await act(async () => { await client.invalidateQueries({ queryKey: ['manuscript-integrity'] }); }); await tick();
  expect(field('AI disclosure wording').value).toBe('Authors reviewed all language assistance.'); expect(host.textContent).toContain('A newer declaration exists');
  mocks.command.mockRejectedValue({ response: { data: { error: { message: 'Declaration changed' } } } }); await act(async () => button('Save AI declaration').click()); await tick();
  expect(mocks.command).toHaveBeenCalledWith('project', 'manuscript', 'snapshot', expect.objectContaining({ kind: 'AI_DECLARATION', expectedVersion: 0 })); expect(field('AI disclosure wording').value).toBe('Authors reviewed all language assistance.');
});
it('requires an explicit acknowledgment and sends no identity impersonation fields', async () => {
  data.records.AI_DECLARATION = record('AI_DECLARATION', { disclosure: 'The authors reviewed AI usage.', venuePolicy: '', externalUsage: [] });
  await mount(); await tab('AI disclosure'); const acknowledge = button('Acknowledge as myself'); expect(acknowledge.disabled).toBe(true);
  const checkbox = [...host.querySelectorAll('label')].find(label => label.textContent?.startsWith('I reviewed this snapshot'))!.querySelector<HTMLInputElement>('input')!;
  await act(async () => checkbox.click()); await act(async () => acknowledge.click()); await tick();
  expect(mocks.command).toHaveBeenCalledWith('project', 'manuscript', 'snapshot', { kind: 'ACKNOWLEDGE', recordId: 'AI_DECLARATION', evidenceDigest: 'digest', confirmed: true });
});
it('recognizes the authenticated canonical viewer after an acknowledgment, including legacy public account ids', async () => {
  const declaration = record('AI_DECLARATION', { disclosure: 'Reviewed AI usage', venuePolicy: '', externalUsage: [] }); declaration.acknowledgedBy = [{ userId: 'actor', at: '2026-11-06T00:00:00Z' }]; data.records.AI_DECLARATION = declaration;
  await mount(); await tab('AI disclosure'); expect(host.textContent).toContain('You acknowledged this declaration.'); expect(button('Acknowledge as myself')).toBeUndefined();
});
it('disables owner-only rights declarations and report exports according to backend permissions', async () => {
  data.permissions.canDeclareRights = false; data.permissions.canExport = false; data.records.READINESS_REPORT = record('READINESS_REPORT');
  await mount(); await tab('Mentorship and rights'); expect(field('Claimed rights holders').closest('fieldset')?.disabled).toBe(true); await tab('Pre-submission review'); expect(button('Export internal report').disabled).toBe(true);
});
it('gives former authors only their declaration packet with readable content and no source request', async () => {
  mocks.packet.mockResolvedValue({ record: record('AI_DECLARATION', { disclosure: 'Language assistance was reviewed.', venuePolicy: '', externalUsage: [] }), snapshotChecksum: 'checksum', viewerId: 'actor', stale: false, canAcknowledge: true, notice: 'Not a certificate' });
  await mount('?snapshot=snapshot&declaration=AI_DECLARATION'); expect(mocks.overview).not.toHaveBeenCalled(); expect(mocks.snapshots).not.toHaveBeenCalled(); expect(host.textContent).toContain('Language assistance was reviewed.'); expect(host.textContent).toContain('does not grant access to manuscript sources'); expect(host.querySelector('pre')).toBeNull();
});
it('blocks acknowledgment of a stale declaration and explains how to recover', async () => {
  mocks.packet.mockResolvedValue({ record: record('AI_DECLARATION', { disclosure: 'Old declaration' }), snapshotChecksum: 'checksum', viewerId: 'actor', stale: true, latestRecordId: 'new-record', canAcknowledge: true, notice: 'Not a certificate' });
  await mount('?snapshot=snapshot&declaration=AI_DECLARATION'); expect(button('Acknowledge as myself')).toBeUndefined(); expect(host.textContent).toContain('no longer matches the current evidence'); expect(host.querySelector('a[href*="new-record"]')).not.toBeNull();
});
it('offers retry after evidence loading fails', async () => {
  mocks.overview.mockRejectedValue(new Error('Offline')); await mount(); expect(host.querySelector('[role="alert"]')).not.toBeNull(); mocks.overview.mockImplementation(async () => data); await act(async () => button('Try again').click()); await tick(); expect(host.textContent).toContain('Author consent is missing');
});
it('supports an empty saved history without inventing snapshot data', async () => {
  mocks.snapshots.mockResolvedValue([]); await mount(); expect(mocks.overview).not.toHaveBeenCalled(); expect(host.textContent).toContain('Create a saved snapshot');
});

it('renders concrete counts in authoritative authorship blockers using the application translation syntax', async () => {
  data.checks[0]!.reason = 'Save an ordered author list and CRediT contribution roles before internal submission. 2 detected scope contributor(s) have not been reviewed as author, acknowledged contributor, or justified non-author. 1 proposed author(s) have not confirmed authorship and author order yet. 3 unresolved contribution or attribution dispute/clarification item(s) must be resolved before submission.';
  await mount();
  expect(host.textContent).toContain('Contributors awaiting a recorded authorship or acknowledgment decision: 2');
  expect(host.textContent).toContain('Proposed authors awaiting authorship and author-order confirmation: 1');
  expect(host.textContent).toContain('Contribution or attribution issues to resolve before submission: 3');
  expect(host.textContent).not.toContain('{count}');
});
