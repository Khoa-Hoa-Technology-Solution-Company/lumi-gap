// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScreeningTaskGuard } from "../components/screening-task-feedback";
import { useScreeningCommand } from "../components/screening-common";
const mocks = vi.hoisted(() => ({ automaticTasks: vi.fn(), save: vi.fn() }));
vi.mock('../api/screening.api', () => ({ screeningApi: mocks }));
vi.mock('@/stores/auth-store', () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: 'actor' } }) }));
let root: Root, host: HTMLDivElement, client: QueryClient;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.resetAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } }); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.unstubAllGlobals(); });
async function render(url = '/projects/p?tab=papers&automaticTask=task') {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><ScreeningTaskGuard projectId="p"><form aria-label="Current action form" /></ScreeningTaskGuard></MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(r => setTimeout(r, 60)); });
}
it('checks current backend authority before showing an automatic task form and never writes on opening', async () => {
  mocks.automaticTasks.mockResolvedValue([{ id: 'task', status: 'TODO', endedAt: null, dueAt: null }]);
  await render(); expect(host.querySelector('form')).not.toBeNull(); expect(mocks.save).not.toHaveBeenCalled();
});
it.each(['DONE', 'EXPIRED', 'CANCELLED', 'REPLACED', 'BLOCKED'])('does not expose the old form for %s', async status => {
  mocks.automaticTasks.mockResolvedValue([{ id: 'task', status, endedAt: status === 'BLOCKED' ? null : '2026-11-03T00:00:00Z', dueAt: null, reason: 'Backend transition reason' }]);
  await render(); expect(host.querySelector('form')).toBeNull(); expect(host.textContent).toContain('Backend transition reason');
});
it('does not show a form for an unknown task and rejects external return links', async () => {
  mocks.automaticTasks.mockResolvedValue([]); await render('/projects/p?automaticTask=missing&taskReturn=https%3A%2F%2Fevil.example');
  expect(host.querySelector('form')).toBeNull(); expect(host.querySelector('a')?.getAttribute('href')).toBe('/projects/p?tab=tasks');
});
function Action() { const command = useScreeningCommand('p'); return <button onClick={() => void command.run({ action: 'STATEMENT' }, mocks.save)}>Save</button>; }
it('ignores backend handoff copy after a successful action without caching or rendering a completion banner', async () => {
  let resolve!: (data: unknown) => void; mocks.save.mockReturnValue(new Promise(r => { resolve = r; }));
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/projects/p?taskReturn=%2Fprojects%2Fp%3Ftab%3Dtasks%26taskSource%3DSCREENING%26taskQ%3Dmedicine']}><Action /></MemoryRouter></QueryClientProvider>));
  await act(async () => host.querySelector('button')!.click()); expect(host.textContent).not.toContain('Bạn đã hoàn thành');
  await act(async () => resolve({ taskFeedback: { completedAction: 'Gửi quan điểm', nextStatus: 'Đang thu thập ý kiến', nextActor: 'Reviewer còn lại' } }));
  await act(async () => { await new Promise(r => setTimeout(r, 40)); });
  expect(client.getQueryData(['screening-action-feedback', 'actor', 'p'])).toBeUndefined();
  expect(host.textContent).not.toContain('Bạn đã hoàn thành');
  expect(host.textContent).not.toContain('Trạng thái tiếp theo');
  expect(host.textContent).not.toContain('Ai cần làm tiếp');
  expect(host.querySelector('a')).toBeNull();
});
it('does not show completion when the backend rejects the action', async () => {
  mocks.save.mockRejectedValue(new Error('Locked packet'));
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><Action /></MemoryRouter></QueryClientProvider>));
  await act(async () => host.querySelector('button')!.click());
  await act(async () => { await new Promise(r => setTimeout(r, 40)); });
  expect(host.textContent).not.toContain('Bạn đã hoàn thành');
});
it('does not create completion feedback when a later command fails after a successful action', async () => {
  mocks.save.mockResolvedValueOnce({ taskFeedback: { completedAction: 'Gửi quan điểm phân xử', nextStatus: 'Đang thu thập ý kiến', nextActor: 'Reviewer còn lại' } }).mockRejectedValueOnce(new Error('Locked packet'));
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><Action /></MemoryRouter></QueryClientProvider>));
  await act(async () => host.querySelector('button')!.click());
  expect(client.getQueryData(['screening-action-feedback', 'actor', 'p'])).toBeUndefined();
  await act(async () => host.querySelector('button')!.click());
  await act(async () => { await new Promise(r => setTimeout(r, 40)); });
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(['screening-action-feedback', 'actor', 'p'])).toBeUndefined();
  expect(host.textContent).not.toContain('Bạn đã hoàn thành');
  expect(host.querySelector('a')).toBeNull();
});
