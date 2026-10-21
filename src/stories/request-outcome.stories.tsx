import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, mocked, userEvent, within, waitFor } from 'storybook/test';
import { RequestOutcomePanel } from '@/components/requests/request-outcome-panel';
import * as api from '@/app/(app)/requests/[id]/outcome-actions';
type View = Exclude<Awaited<ReturnType<typeof api.readRequestOutcome>>, { error: string }>;
const requestId = '00000000-0000-4000-a000-000000006000';
const release = { exposureDate: '2026-10-21', audience: 'All shoppers', evidence: 'Full audience release log', startDate: '2026-10-21', dueDate: '2026-10-28', windowKind: 'relative' as const };
const agreed = { form: 'numeric' as const, label: 'Conversion rate', unit: '%', baseline: 50, target: 80, guardrails: [{ metric: 'User error rate', operator: 'at_most' as const, limit: 3, unit: '%' }] };
const due: View = {
    requestId, revision: 1, ownerId: 'owner', names: { owner: 'Maya Chen' }, state: 'measuring', agreed, release,
    measurement: { due: true, days: -1, label: '1 day overdue' }, closure: null, corrections: [],
    canClose: true, canCloseException: true, canCorrect: false, canFollowUp: true, followUpOf: null, followUps: [],
};
const closed: View = {
    ...due, revision: 2, state: 'closed', canClose: false, canCloseException: false, canCorrect: true,
    closure: { version: 1, kind: 'measured', actorId: 'owner', ownerId: 'owner', closedAt: '2026-10-29T09:00:00.000Z', operationId: '00000000-0000-4000-a000-000000006001', fingerprint: 'f'.repeat(64), revision: 2, expected: { kind: 'verification', result: 'x', source: '', reviewAfterDays: 7 }, release, primary: { kind: 'numeric', actual: 62, unit: '%' }, guardrails: [{ ...agreed.guardrails[0], actual: 4, held: false }], evidence: 'Analytics export', observedFrom: '2026-10-21', observedTo: '2026-10-28' },
};
const meta = {
    title: 'Requests/Outcome closure', component: RequestOutcomePanel, args: { requestId, orgId: 'org-story', revision: 1 },
    beforeEach: () => {
        mocked(api.readRequestOutcome).mockReset().mockResolvedValue(structuredClone(due));
        mocked(api.changeRequestOutcome).mockReset();
        mocked(api.createFollowUpRequest).mockReset();
    },
} satisfies Meta<typeof RequestOutcomePanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CloseWithMeasuredResultAndRecovery: Story = { play: async ({ canvasElement }) => {
        const c = within(canvasElement);
        await c.findByText('Measuring · 1 day overdue');
        await c.findByText('50% → 80%');
        c.getByRole('button', { name: 'Close Request' }).focus();
        await userEvent.keyboard('{Enter}');
        await userEvent.type(c.getByLabelText('Actual Conversion rate (%)'), '62');
        await userEvent.type(c.getByLabelText('Actual User error rate (%)'), '4');
        await userEvent.type(c.getByLabelText('Evidence and source'), 'Analytics export');
        mocked(api.changeRequestOutcome).mockResolvedValueOnce({ error: 'Could not save the outcome. Your input is preserved; try again.' }).mockImplementationOnce(async () => { mocked(api.readRequestOutcome).mockResolvedValue(structuredClone(closed)); return { success: true, revision: 2 }; });
        await userEvent.click(c.getByRole('button', { name: 'Close with measured result' }));
        await c.findByRole('alert');
        await expect(c.getByLabelText('Evidence and source')).toHaveValue('Analytics export');
        await userEvent.click(c.getByRole('button', { name: 'Close with measured result' }));
        await c.findByText('Closed · Measured result');
        await c.findByText(/Actual 4% · Breached/);
        const calls = mocked(api.changeRequestOutcome).mock.calls;
        expect(calls[0][0].operationId).toBe(calls[1][0].operationId);
        expect(calls[1][1]).toEqual({ kind: 'measured', primary: { kind: 'numeric', actual: 62 }, guardrails: [4], evidence: 'Analytics export', observedFrom: '2026-10-21', observedTo: expect.any(String) });
        await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(c.getByRole('heading', { name: 'Outcome' })));
    } };
export const NotYetDue: Story = { beforeEach: () => { mocked(api.readRequestOutcome).mockResolvedValue({ ...due, canClose: false, measurement: { due: false, days: 3, label: '3 days remaining' } }); }, play: async ({ canvasElement }) => {
        const c = within(canvasElement);
        await c.findByText('Measuring · 3 days remaining');
        expect(c.queryByRole('button', { name: 'Close Request' })).toBeNull();
        await c.findByRole('button', { name: 'Close with exception' });
    } };
export const CloseWithException: Story = { play: async ({ canvasElement }) => {
        const c = within(canvasElement);
        await userEvent.click(await c.findByRole('button', { name: 'Close with exception' }));
        await userEvent.click(c.getByRole('combobox', { name: 'Exception' }));
        const body = within(canvasElement.ownerDocument.body);
        expect(body.queryByRole('option', { name: 'Not launched or cancelled' })).toBeNull();
        await userEvent.click(body.getByRole('option', { name: 'Rolled back' }));
        await waitFor(() => expect(getComputedStyle(canvasElement.ownerDocument.body).pointerEvents).not.toBe('none'));
        await userEvent.type(c.getByLabelText('Exception reason'), 'Payment errors spiked');
        mocked(api.changeRequestOutcome).mockImplementationOnce(async () => {
            mocked(api.readRequestOutcome).mockResolvedValue({ ...due, revision: 2, state: 'closed', canClose: false, canCloseException: false, canCorrect: true, closure: { version: 2, kind: 'exception', reasonCode: 'rolled_back', reason: 'Payment errors spiked', actorId: 'owner', ownerId: 'owner', closedAt: '2026-10-25T00:00:00.000Z', operationId: '00000000-0000-4000-a000-000000006002', fingerprint: 'f'.repeat(64), release, revision: 2 } });
            return { success: true, revision: 2 };
        });
        await userEvent.click(c.getByRole('button', { name: 'Close with exception' }));
        await c.findByText('Closed · Exception: Rolled back. Excluded from measured impact.');
        expect(c.queryByText(/^Actual$/)).toBeNull();
    } };
export const CorrectionBesideImmutableClosure: Story = { beforeEach: () => { mocked(api.readRequestOutcome).mockResolvedValue(structuredClone(closed)); }, play: async ({ canvasElement }) => {
        const c = within(canvasElement);
        await userEvent.click(await c.findByRole('button', { name: 'Add correction' }));
        await userEvent.click(c.getByRole('combobox', { name: 'What needs correcting' }));
        await userEvent.click(within(canvasElement.ownerDocument.body).getByRole('option', { name: 'Evidence' }));
        await waitFor(() => expect(getComputedStyle(canvasElement.ownerDocument.body).pointerEvents).not.toBe('none'));
        await userEvent.type(c.getByLabelText('Correction'), 'Export covered 21–27 October');
        await userEvent.type(c.getByLabelText('Correction reason'), 'Mislabelled range');
        mocked(api.changeRequestOutcome).mockImplementationOnce(async () => {
            mocked(api.readRequestOutcome).mockResolvedValue({ ...closed, revision: 3, corrections: [{ operationId: '00000000-0000-4000-a000-000000006003', fingerprint: 'f'.repeat(64), actorId: 'owner', at: '2026-10-30T00:00:00.000Z', field: 'evidence', correction: 'Export covered 21–27 October', reason: 'Mislabelled range', revision: 3 }] });
            return { success: true, revision: 3 };
        });
        await userEvent.click(c.getByRole('button', { name: 'Save correction' }));
        await c.findByText('Evidence: Export covered 21–27 October');
        await c.findByText('Evidence: Analytics export');
    } };
export const FollowUpAfterRelease: Story = { play: async ({ canvasElement }) => {
        const c = within(canvasElement);
        await userEvent.click(await c.findByRole('button', { name: 'Create follow-up Request' }));
        await userEvent.type(c.getByLabelText('What changed and why'), 'Mobile checkout needs the same fix');
        mocked(api.createFollowUpRequest).mockResolvedValueOnce({ success: true, revision: 1, followUpId: '00000000-0000-4000-a000-000000006004' });
        await userEvent.click(c.getByRole('button', { name: 'Create follow-up Request' }));
        await waitFor(() => expect(mocked(api.createFollowUpRequest)).toHaveBeenCalledWith(expect.objectContaining({ requestId }), { reason: 'Mobile checkout needs the same fix' }));
    } };
export const ClosedMobileDark: Story = {
    globals: { theme: 'dark', viewport: { value: 'mobile', isRotated: false } },
    beforeEach: () => { mocked(api.readRequestOutcome).mockResolvedValue({ ...closed, followUps: [{ id: '00000000-0000-4000-a000-000000006005', title: 'Mobile checkout', requestNumber: 12, createdBy: 'owner', createdAt: '2026-10-30T00:00:00.000Z', reason: 'Same fix on mobile' }] }); },
    play: async ({ canvasElement }) => {
        const c = within(canvasElement);
        await c.findByText('Closed · Measured result');
        await c.findByRole('link', { name: /Mobile checkout/ });
        await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    },
};
