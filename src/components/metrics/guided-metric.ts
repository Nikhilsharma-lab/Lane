import { metricDefinitionInputSchema } from '@/lib/metric-definition-rules';

export const guideKinds = [
  { value: 'completion', label: 'How many people finish something', description: 'For example, finish signup after starting it. Measured as a percentage.' },
  { value: 'share', label: 'What share of a group', description: 'For example, the percentage of survey responses rated 4 or 5.' },
  { value: 'count', label: 'How many times something happens', description: 'For example, trials started or support requests received.' },
  { value: 'time', label: 'How long something takes', description: 'For example, the time from opening setup to creating a workspace.' },
];
export const blankGuide = {kind:'', name:'', start:'', end:'', basis:'', window:'', part:'', whole:'', event:'', summary:'', unit:''};
export type MetricGuide = typeof blankGuide;
export type GuideField = keyof MetricGuide;
export function buildMetricDefinition(input: MetricGuide) {
  const v = Object.fromEntries(Object.entries(input).map(([key,value]) => [key,value.trim()])) as MetricGuide;
  const fields: Partial<Record<GuideField,string>> = {};
  if (!guideKinds.some(kind => kind.value === v.kind)) fields.kind = "Choose what you want to measure.";
  const required: GuideField[] = v.kind === 'completion' ? ['name','start','end','basis','window'] : v.kind === 'share' ? ['name','part','whole','basis'] : v.kind === 'count' ? ['name','event','basis'] : v.kind === 'time' ? ['name','start','end','summary','unit'] : ['kind'];
  const messages: Record<GuideField,string> = {kind:'Choose what you want to measure.',name:'Give this metric a specific name.',start:'Describe what happens first.',end:'Describe what counts as finished.',basis:'Choose what to count.',window:'Choose how long they have to finish.',part:'Describe the part you want to count.',whole:'Describe the whole group it belongs to.',event:'Describe what you want to count.',summary:'Choose how to summarize the times.',unit:'Choose seconds or minutes.'};
  for (const key of required) if (!v[key]) fields[key] = messages[key];
  if (v.start && v.start.toLowerCase() === v.end.toLowerCase()) fields.end = 'The finish must be different from the start.';
  if (v.part && v.part.toLowerCase() === v.whole.toLowerCase()) fields.part = 'Describe a part of the whole group.';
  if (Object.keys(fields).length) return {ok:false as const, fields};
  const unit = v.kind === 'count' ? 'count' : v.kind === 'time' ? v.unit : 'percent';
  const howCounted = v.kind === 'completion'
    ? `Percentage of ${v.basis} who go from “${v.start}” to “${v.end}” within ${v.window}. Divide completed ${v.basis} by starting ${v.basis} × 100. Count each once in the same starting group.`
    : v.kind === 'share' ? `“${v.part}” divided by “${v.whole}” × 100, counting ${v.basis} once each in the same measurement period. The first group is part of the second.`
    : v.kind === 'count' ? v.basis === 'people' ? `Number of unique people who perform “${v.event}” during the measurement period. Count each person once.` : `Number of times “${v.event}” happens during the measurement period. Include repeat occurrences.`
    : `${v.summary} time from “${v.start}” to “${v.end}”, in ${unit}. Include completed attempts only, pairing each finish with its matching start.`;
  const values = {name:v.name,unit,link:'',howCounted};
  const parsed = metricDefinitionInputSchema.safeParse(values);
  if (!parsed.success) return {ok:false as const, fields:{name:'Shorten the name or answers so the definition fits.'}};
  return {ok:true as const, values};
}
