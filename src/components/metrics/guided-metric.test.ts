import { describe, expect, it } from 'vitest';
import { blankGuide, buildMetricDefinition, kindsForUnit } from './guided-metric';

describe('guided definitions', () => {
  it('does not invent missing measurement details', () => {
    expect(buildMetricDefinition(blankGuide).ok).toBe(false);
  });
  it('keeps the starting group and completion window explicit', () => {
    const result = buildMetricDefinition({...blankGuide, kind:'completion', name:'Signup completion', start:'Signup started', end:'Account created', basis:'people', window:'24 hours'});
    expect(result).toEqual({ok:true, values:{name:'Signup completion',unit:'percent',link:'',howCounted:'Percentage of people who go from “Signup started” to “Account created” within 24 hours. Divide completed people by starting people × 100. Count each once in the same starting group.'}});
  });
  it('rejects identical start and finish', () => {
    expect(buildMetricDefinition({...blankGuide,kind:'completion',name:'Signup',start:'Start',end:' start ',basis:'people',window:'24 hours'}).ok).toBe(false);
  });
  it('preserves count and duration meaning', () => {
    expect(buildMetricDefinition({...blankGuide,kind:'count',name:'Trials',event:'Trial started',basis:'occurrences'})).toMatchObject({ok:true,values:{unit:'count',howCounted:'Number of times “Trial started” happens during the measurement period. Include repeat occurrences.'}});
    expect(buildMetricDefinition({...blankGuide,kind:'time',name:'Setup time',start:'Setup opened',end:'Workspace created',summary:'Median',unit:'minutes'})).toMatchObject({ok:true,values:{unit:'minutes'}});
  });
});

// #288: "Add how it's counted" asks only the questions that measure in the metric's unit already.
describe('questions for a unit', () => {
  it('offers the kinds that measure in the unit, or every kind for a new metric', () => {
    const kinds = (unit?: string) => kindsForUnit(unit).map(kind => kind.value);
    expect(kinds('percent')).toEqual(['completion', 'share']);
    expect(kinds('count')).toEqual(['count']);
    expect(kinds('seconds')).toEqual(['time']);
    expect(kinds('minutes')).toEqual(['time']);
    expect(kinds()).toEqual(['completion', 'share', 'count', 'time']);
  });

  it('keeps the unit of a timed metric', () => {
    const result = buildMetricDefinition({ ...blankGuide, kind: 'time', name: 'Checkout time', start: 'Checkout opened', end: 'Order confirmed', summary: 'Median', unit: 'minutes' });
    expect(result.ok && result.values.unit).toBe('minutes');
  });
});
