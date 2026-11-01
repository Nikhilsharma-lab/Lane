import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MeasurementPlanSummary } from '@/components/requests/measurement-plan-summary';
import { expectedImpactDraftSchema } from './request-impact';
import { createEmptyMeasurementPlan, createMeasurementPrimary, measurementPlanSchema, measurementReadiness } from './request-measurement';
import { measurementEditorChanges, measurementEditorValue } from './request-measurement-editor';
import { agreedResult } from './request-outcome';

const details = { result: 'Download an invoice', steps: 'Open an order and choose Download invoice.', pass: 'A PDF opens with the matching order number and amount.' };
const custom = () => ({ ...createEmptyMeasurementPlan(), primary: { ...createMeasurementPrimary('check'), check: 'custom', checkDetails: { ...details } } });

describe('a Requester-defined pass/fail result', () => {
  it('preserves all three answers through validation and editing', () => {
    const saved = measurementPlanSchema.parse(custom());
    expect(saved.primary).toMatchObject({ check: 'custom', checkDetails: details });
    expect(measurementEditorChanges(measurementEditorValue(saved), saved)).toEqual(saved);
    expect(measurementReadiness(saved, 'improvement')).toBeNull();
    expect(agreedResult(saved)).toMatchObject({ form: 'pass_fail', label: 'Download an invoice', baseline: null, target: null });
  });
  it('keeps unfinished answers in a draft but requires all three before saving', () => {
    for (const field of ['result', 'steps', 'pass']) {
      const draft = custom();
      Object.assign(draft.primary.checkDetails, { [field]: '  ' });
      expect(expectedImpactDraftSchema.parse(draft)).toEqual(draft);
      const saved = measurementPlanSchema.safeParse(draft);
      expect(saved.success).toBe(false);
      if (!saved.success) expect(saved.error.issues.some(issue => issue.path.join('.') === `primary.checkDetails.${field}`)).toBe(true);
    }
  });
  it('does not accept custom details on a numeric metric or an older plan', () => {
    const draft = custom();
    expect(measurementPlanSchema.safeParse({ ...draft, version: 4 }).success).toBe(false);
    expect(measurementPlanSchema.safeParse({ ...draft, primary: { ...draft.primary, check: 'keyboard' } }).success).toBe(false);
    expect(measurementPlanSchema.safeParse({ ...draft, primary: { ...draft.primary, current: 1 } }).success).toBe(false);
  });
  it('shows the actual answers, escaped, in the review and saved Goal', () => {
    const draft = custom();
    draft.primary.checkDetails.result = 'Download <invoice>';
    const html = renderToStaticMarkup(createElement(MeasurementPlanSummary, { plan: measurementPlanSchema.parse(draft) }));
    expect(html).toContain('Download &lt;invoice&gt;');
    expect(html).toContain(details.steps);
    expect(html).toContain(details.pass);
  });
});
