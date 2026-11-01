import { describe, expect, it } from 'vitest';
import { blankGuide, buildMetricDefinition } from './guided-metric';

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
