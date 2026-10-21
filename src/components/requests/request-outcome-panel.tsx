'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOptimisticAction } from './use-optimistic-action';
import { Input } from '@/components/arc/input/input';
import { Textarea } from '@/components/arc/textarea/textarea';
import { Select } from '@/components/arc/select/select';
import { Button } from '@/components/arc/button/button';
import * as actions from '@/app/(app)/requests/[id]/outcome-actions';
import { formatRequestCode } from '@/lib/request-code';
import { guardrailComparisonPhrase } from '@/lib/guardrail-comparison';
import { correctableFields, CORRECTION_FIELD_OPTIONS, EXCEPTION_REASON_OPTIONS, type OutcomeChange } from '@/lib/request-outcome';
import styles from './request-agreement.module.css';
type View = Exclude<Awaited<ReturnType<typeof actions.readRequestOutcome>>, {
    error: string;
}>;
type Mode = 'close' | 'exception' | 'correct' | 'follow' | null;
const value = (n: number | null, unit: string) => n === null ? 'No baseline' : unit === '%' ? `${n}%` : `${n} ${unit}`.trim();
const reasonLabel = (code: string) => code === 'superseded' ? 'Superseded by another Request' : EXCEPTION_REASON_OPTIONS.find(o => o.value === code)?.label ?? code;
/** Outcome closure on Request detail: measured result or exception, corrections and follow-ups. */
export function RequestOutcomePanel({ requestId, orgId, revision }: {
    requestId: string;
    orgId: string;
    revision: number;
}) {
    const router = useRouter();
    const runAction = useOptimisticAction();
    const [view, setView] = useState<View | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [mode, setMode] = useState<Mode>(null);
    const [actual, setActual] = useState('');
    const [passed, setPassed] = useState('');
    const [guardrails, setGuardrails] = useState<string[]>([]);
    const [evidence, setEvidence] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [reasonCode, setReasonCode] = useState('');
    const [field, setField] = useState('');
    const [text, setText] = useState('');
    const [reason, setReason] = useState('');
    const retry = useRef<{ fingerprint: string; operationId: string; expectedRevision: number } | null>(null);
    const running = useRef(false);
    const heading = useRef<HTMLHeadingElement>(null);
    const generation = useRef(0);
    const load = useCallback(async () => {
        const current = ++generation.current;
        try {
            const next = await actions.readRequestOutcome(requestId, { orgId });
            if (current !== generation.current)
                return;
            if ('error' in next)
                setError(next.error || 'Could not load the outcome. Try again.');
            else {
                setView(next);
                setError('');
            }
        }
        catch {
            if (current === generation.current)
                setError('Could not load the outcome. Try again.');
        }
    }, [requestId, orgId]);
    useEffect(() => {
        let active = true;
        actions.readRequestOutcome(requestId, { orgId }).then(next => {
            if (!active) return;
            if ('error' in next) setError(next.error || 'Could not load the outcome. Try again.');
            else { setView(next); setError(''); }
        }).catch(() => { if (active) setError('Could not load the outcome. Try again.'); });
        return () => { active = false; };
    }, [requestId, orgId, revision]);
    function open(next: Mode) {
        if (!view)
            return;
        setMode(next);
        setReason('');
        setText('');
        if (next === 'close') {
            setGuardrails(view.agreed?.guardrails.map(() => '') ?? []);
            setFrom(view.release?.startDate ?? '');
            setTo(view.release && view.release.dueDate < new Date().toISOString().slice(0, 10) ? view.release.dueDate : new Date().toISOString().slice(0, 10));
        }
    }
    async function save(input: OutcomeChange | { reason: string }, followUp = false) {
        if (!view || running.current)
            return;
        running.current = true;
        setBusy(true);
        setError('');
        const fingerprint = JSON.stringify({ followUp, input });
        if (retry.current?.fingerprint !== fingerprint)
            retry.current = { fingerprint, operationId: crypto.randomUUID(), expectedRevision: view.revision };
        try {
            const ctx = { orgId, requestId, operationId: retry.current.operationId, expectedRevision: retry.current.expectedRevision };
            const outcome = await runAction({
                id: requestId, refreshOnError: false,
                run: () => followUp ? actions.createFollowUpRequest(ctx, input) : actions.changeRequestOutcome(ctx, input),
                onError: message => setError(message),
            });
            if (outcome.status !== 'success')
                return;
            const result = outcome.value;
            if ('error' in result) {
                setError(result.error);
                if (result.error.includes('Reload'))
                    retry.current = null;
                return;
            }
            retry.current = null;
            setMode(null);
            if ('followUpId' in result) {
                router.push(`/requests/${result.followUpId}`);
                return;
            }
            await load();
            heading.current?.focus();
        }
        catch {
            setError('Could not save the outcome. Your input is preserved; try again.');
        }
        finally {
            running.current = false;
            setBusy(false);
        }
    }
    const agreed = view?.agreed;
    const closure = view?.closure;
    const status = !view ? '' : closure
        ? closure.kind === 'measured' ? 'Closed · Measured result' : `Closed · Exception: ${reasonLabel(closure.reasonCode)}. Excluded from measured impact.`
        : view.state === 'measuring' ? `Measuring · ${view.measurement?.label ?? ''}` : 'Not started';
    const cancel = <Button variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancel</Button>;
    return <section id="outcome" className={styles.panel} aria-labelledby="outcome-heading" aria-busy={busy}>
   <div className={styles.controls}><h2 id="outcome-heading" tabIndex={-1} ref={heading}>Outcome</h2><Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>Refresh outcome</Button></div>
   {error && <p role="alert">{error}</p>}
   {!view ? <p role="status">{error ? 'Outcome details unavailable.' : 'Loading outcome…'}</p> : <>
     <p role="status">{status}</p>
     {view.followUpOf && <p>Follow-up of <Link href={`/requests/${view.followUpOf.id}`}>{formatRequestCode(view.followUpOf.requestNumber)} {view.followUpOf.title}</Link></p>}
     {agreed && <dl className={styles.facts}>
       <div><dt>Agreed {agreed.form === 'numeric' ? 'metric' : 'check'}</dt><dd>{agreed.label}</dd></div>
       {agreed.form === 'numeric' && <div><dt>Baseline → target</dt><dd>{value(agreed.baseline, agreed.unit)} → {value(agreed.target, agreed.unit)}</dd></div>}
       {closure?.kind === 'measured' && <div><dt>Actual</dt><dd>{closure.primary.kind === 'numeric' ? value(closure.primary.actual, closure.primary.unit) : closure.primary.passed ? 'Passed' : 'Did not pass'}</dd></div>}
       {agreed.guardrails.map((g, i) => {
                const result = closure?.kind === 'measured' ? closure.guardrails[i] : undefined;
                return <div key={i}><dt>Guardrail: {g.metric}</dt><dd>Stays {guardrailComparisonPhrase[g.operator]} {value(g.limit, g.unit)}{result && ` · Actual ${value(result.actual, result.unit)} · ${result.held ? 'Held' : 'Breached'}`}</dd></div>;
            })}
     </dl>}
     {closure?.kind === 'measured' && <div className={styles.facts}>
       <p>Evidence: {closure.evidence}</p>
       <p>Observed <time dateTime={closure.observedFrom}>{closure.observedFrom}</time> to <time dateTime={closure.observedTo}>{closure.observedTo}</time> (UTC).</p>
     </div>}
     {closure?.kind === 'exception' && <p>{closure.reason}</p>}
     {closure && <p className={styles.muted}>Closed by {view.names[closure.actorId]} on <time dateTime={closure.closedAt}>{closure.closedAt}</time>. Closed Requests never reopen.</p>}
     {!!view.corrections.length && <div><h3>Corrections</h3><ol>{view.corrections.map(c => <li key={c.operationId}>
       <p>{CORRECTION_FIELD_OPTIONS.find(o => o.value === c.field)?.label}: {c.correction}</p>
       <p className={styles.muted}>Reason: {c.reason}. Added by {view.names[c.actorId]} on <time dateTime={c.at}>{c.at}</time>.</p>
     </li>)}</ol></div>}
     {!closure && view.state === 'measuring' && !view.canClose && <p className={styles.muted}>Close Request opens on the measurement due date. Overdue outcomes stay outstanding until closed.</p>}
     {mode === null && <div className={styles.controls}>
       {view.canClose && <Button disabled={busy} onClick={() => open('close')}>Close Request</Button>}
       {view.canCloseException && <Button variant="secondary" disabled={busy} onClick={() => open('exception')}>Close with exception</Button>}
       {view.canCorrect && <Button variant="secondary" disabled={busy} onClick={() => open('correct')}>Add correction</Button>}
       {view.canFollowUp && <Button variant="ghost" disabled={busy} onClick={() => open('follow')}>Create follow-up Request</Button>}
     </div>}
     {mode === 'close' && agreed && <form className={styles.stack} onSubmit={e => {
                e.preventDefault();
                void save({ kind: 'measured', primary: agreed.form === 'numeric' ? { kind: 'numeric', actual: Number(actual) } : { kind: 'pass_fail', passed: passed === 'passed' }, guardrails: guardrails.map(Number), evidence, observedFrom: from, observedTo: to });
            }}>
       <p>Record what happened. Below-target and neutral results close too; success is not required.</p>
       {agreed.form === 'numeric'
                ? <Input label={`Actual ${agreed.label} (${agreed.unit})`} type="number" step="any" required value={actual} onChange={e => setActual(e.target.value)} disabled={busy} description={`Agreed: ${value(agreed.baseline, agreed.unit)} → ${value(agreed.target, agreed.unit)}`}/>
                : <Select label={`Result: ${agreed.label}`} options={[{ value: 'passed', label: 'Passed' }, { value: 'failed', label: 'Did not pass' }]} value={passed} onValueChange={setPassed} disabled={busy}/>}
       {agreed.guardrails.map((g, i) => <Input key={i} label={`Actual ${g.metric} (${g.unit})`} type="number" step="any" required value={guardrails[i] ?? ''} onChange={e => setGuardrails(all => all.map((v, j) => j === i ? e.target.value : v))} disabled={busy} description={`Guardrail: stays ${guardrailComparisonPhrase[g.operator]} ${value(g.limit, g.unit)}`}/>)}
       <Textarea label="Evidence and source" required maxLength={4000} value={evidence} onChange={e => setEvidence(e.target.value)} disabled={busy} description="Where the actual result can be checked."/>
       <div className={styles.fields}>
         <Input label="Observed from (UTC)" type="date" required value={from} onChange={e => setFrom(e.target.value)} disabled={busy}/>
         <Input label="Observed to (UTC)" type="date" required max={new Date().toISOString().slice(0, 10)} value={to} onChange={e => setTo(e.target.value)} disabled={busy}/>
       </div>
       <div className={styles.controls}><Button type="submit" disabled={busy || (agreed.form === 'pass_fail' && !passed)}>{busy ? 'Closing…' : 'Close with measured result'}</Button>{cancel}</div>
     </form>}
     {mode === 'exception' && <form className={styles.stack} onSubmit={e => { e.preventDefault(); void save({ kind: 'exception', reasonCode: reasonCode as typeof EXCEPTION_REASON_OPTIONS[number]['value'], reason }); }}>
       <p>Exceptions close without inventing a result and stay outside measured-impact totals.</p>
       <Select label="Exception" options={EXCEPTION_REASON_OPTIONS.filter(o => view.release ? o.value !== 'cancelled' : o.value === 'cancelled' || o.value === 'measurement_unavailable')} value={reasonCode} onValueChange={setReasonCode} disabled={busy}/>
       <Textarea label="Exception reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy}/>
       <div className={styles.controls}><Button type="submit" disabled={busy || !reasonCode}>{busy ? 'Closing…' : 'Close with exception'}</Button>{cancel}</div>
     </form>}
     {mode === 'correct' && <form className={styles.stack} onSubmit={e => { e.preventDefault(); void save({ kind: 'correction', field: field as typeof CORRECTION_FIELD_OPTIONS[number]['value'], correction: text, reason }); }}>
       <p>Corrections appear beside the original closure. They never change its result, evidence or target.</p>
       <Select label="What needs correcting" options={CORRECTION_FIELD_OPTIONS.filter(o => closure && correctableFields(closure.kind).includes(o.value))} value={field} onValueChange={setField} disabled={busy}/>
       <Textarea label="Correction" required maxLength={4000} value={text} onChange={e => setText(e.target.value)} disabled={busy}/>
       <Textarea label="Correction reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy}/>
       <div className={styles.controls}><Button type="submit" disabled={busy || !field}>{busy ? 'Saving…' : 'Save correction'}</Button>{cancel}</div>
     </form>}
     {mode === 'follow' && <form className={styles.stack} onSubmit={e => { e.preventDefault(); void save({ reason }, true); }}>
       <p>The follow-up copies this context, needs fresh agreement and has its own outcome. This Request keeps its measurement obligation.</p>
       <Textarea label="What changed and why" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy}/>
       <div className={styles.controls}><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create follow-up Request'}</Button>{cancel}</div>
     </form>}
     {!!view.followUps.length && <div><h3>Follow-ups</h3><ul>{view.followUps.map(f => <li key={f.id}>
       <Link href={`/requests/${f.id}`}>{formatRequestCode(f.requestNumber)} {f.title}</Link>
       <p className={styles.muted}>{f.reason}</p>
     </li>)}</ul></div>}
   </>}
 </section>;
}
