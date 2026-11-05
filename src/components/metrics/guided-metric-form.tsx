"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Input } from '@/components/arc/input/input';
import { Select } from '@/components/arc/select/select';
import { Button } from '@/components/arc/button/button';
import { RadioGroup } from '@/components/arc/radio-group/radio-group';
import { blankGuide, buildMetricDefinition, guideKinds, type GuideField } from './guided-metric';
import type { MetricDefinitionValues, MetricFormResult } from './metric-definition-form';
import styles from './metric-definition-form.module.css';

export function GuidedMetricForm({initialName = '', onSubmit, onSaved, onCancel, onPendingChange}: {
  initialName?: string;
  onSubmit: (values: MetricDefinitionValues) => Promise<MetricFormResult>;
  onSaved?: () => void;
  onCancel: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [values,setValues] = useState({...blankGuide,name:initialName});
  const [step,setStep] = useState(1);
  const [fields,setFields] = useState<Partial<Record<GuideField,string>>>({});
  const [error,setError] = useState('');
  const [pending,setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (window.matchMedia("(pointer: fine)").matches) form.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus(); }, []);
  const result = buildMetricDefinition(values);
  const set = (key: GuideField,value:string) => {setValues(v=>({...v,[key]:value}));setFields(v=>({...v,[key]:undefined}));};
  function focus(key: string) {requestAnimationFrame(()=>form.current?.querySelector<HTMLElement>(`[data-field="${key}"] input, [data-field="${key}"] [role="combobox"]`)?.focus());}
  const input = (key: GuideField,label:string,example:string) => <div data-field={key}><Input label={label} description={example} value={values[key]} maxLength={key==='name'?120:70} onChange={e=>set(key,e.target.value)} readOnly={pending} required error={fields[key]} autoComplete="off" spellCheck={false} data-1p-ignore /></div>;
  const select = (key: GuideField,label:string,options:{value:string;label:string}[]) => <div data-field={key}><Select label={label} placeholder="Choose an answer" options={options} value={values[key]} onValueChange={v=>set(key,v)} disabled={pending} required error={fields[key]} /></div>;
  async function submit(event:FormEvent) {
    event.preventDefault(); event.stopPropagation(); if(pending)return;
    if(step===1){if(!values.kind){setFields({kind:'Choose what you want to measure.'});return;}setStep(2);focus('name');return;}
    if(!result.ok){setFields(result.fields);focus(Object.keys(result.fields)[0]);return;}
    setPending(true);onPendingChange?.(true);setError('');
    try {const saved=await onSubmit(result.values);if('error' in saved){setError(saved.error);if(saved.fields?.name){setFields({name:saved.fields.name});focus('name');}}else onSaved?.();}
    catch {setError("The metric couldn’t be saved. Your answers are still here. Try again.");}
    finally {setPending(false);onPendingChange?.(false);}
  }
  const groups=[{value:'people',label:'People (once each)'},{value:'attempts',label:'Attempts (once each)'},{value:'sessions',label:'Visits (once each)'}];
  return <form ref={form} className={styles.form} onSubmit={submit} noValidate aria-busy={pending || undefined}>
    <p className={styles.note}>Step {step} of 2 · {step===1?'Choose your question':'Describe what to count'}</p>
    <div className={styles.step} hidden={step!==1}>
      <p className={styles.note}>A metric is a number you compare before and after a change. These examples all use an online shop. You can describe your own product next.</p>
      <div data-field="kind"><RadioGroup label="What do you want to find out?" options={guideKinds} value={values.kind} onValueChange={kind=>{setValues({...blankGuide,name:values.name,kind});setFields({});}} /></div>{fields.kind&&<p className={styles.error} role="alert">{fields.kind}</p>}
    </div><div className={styles.step} hidden={step!==2}>
      {input('name','Name this metric',values.kind === 'count' ? 'Example: Orders placed.' : values.kind === 'time' ? 'Example: Checkout time.' : values.kind === 'share' ? 'Example: Checkout error rate.' : 'Example: Checkout completion rate.')}
      {(values.kind==='completion'||values.kind==='time')&&<div className={styles.questions}>{input('start','What marks the start?','Example: Checkout opened.')}{input('end','What marks the finish?','Example: Order confirmed.')}</div>}
      {values.kind==='completion'&&<div className={styles.questions}>{select('basis','Count people, attempts or visits?',groups)}{select('window','Finish within how long of starting?', ['1 hour','24 hours','7 days','30 days'].map(value=>({value,label:value})))}</div>}
      {values.kind==='share'&&<>{input('part','Which cases should count toward the percentage?','Example: Checkout attempts with a payment error.')}{input('whole','What total will you compare that with?','Example: All checkout attempts, including those with no error.')}{select('basis','Count people, attempts, visits or responses?',[...groups,{value:'responses',label:'Survey responses'}])}</>}
      {values.kind==='count'&&<>{input('event','What happens for the count to go up by one?','Example: An order is placed.')}{select('basis','If one person does it twice, count…',[{value:'occurrences',label:'Both times'},{value:'people',label:'That person only once'}])}</>}
      {values.kind==='time'&&<div className={styles.questions}>{select('summary','How will you combine the times?',[{value:'Median',label:'Middle value (median)'},{value:'Mean',label:'Add times, divide by count (average)'}])}{select('unit','Measure in seconds or minutes?',[{value:'seconds',label:'Seconds'},{value:'minutes',label:'Minutes'}])}</div>}
      {result.ok&&<section className={styles.savedDefinition} aria-label="Definition preview"><strong>Your team will measure</strong><p>{result.values.howCounted}</p></section>}
      <p className={styles.note}>No numbers needed yet. Save what you want to measure, then enter your measured values on a Request. Lane does not track these events for you.</p>
    </div>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}><Button type="button" variant="ghost" disabled={pending} onClick={step===1?onCancel:()=>{setStep(1);setError('');focus('kind');}}> {step===1?'Cancel':'Back'} </Button><Button type="submit" loading={pending}>{step===1?'Continue':'Create metric'}</Button></div>
  </form>;
}
