'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOptimisticAction } from './use-optimistic-action';
import { Input } from '@/components/arc/input/input';
import { Textarea } from '@/components/arc/textarea/textarea';
import { Select } from '@/components/arc/select/select';
import { Checkbox } from '@/components/arc/checkbox/checkbox';
import { Button } from '@/components/arc/button/button';
import * as actions from '@/app/(app)/requests/[id]/release-actions';
import type { ReleaseChange } from '@/lib/request-release';
import styles from './request-agreement.module.css';
type View = Exclude<Awaited<ReturnType<typeof actions.readRequestRelease>>, {
    error: string;
}>;
export function RequestReleasePanel({ requestId, orgId, revision }: {
    requestId: string;
    orgId: string;
    revision: number;
}) {
    const runAction = useOptimisticAction();
    const [view, setView] = useState<View | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [date, setDate] = useState('');
    const [evidence, setEvidence] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [reason, setReason] = useState('');
    const [recipient, setRecipient] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [mode, setMode] = useState<'correct' | 'void' | null>(null);
    const retry = useRef<{
        fingerprint: string;
        operationId: string;
        expectedRevision: number;
    } | null>(null);
    const running = useRef(false);
    const heading = useRef<HTMLHeadingElement>(null);
    const generation = useRef(0);
    const reload = useCallback(async () => {
        const current = ++generation.current;
        try {
            const next = await actions.readRequestRelease(requestId, { orgId });
            if (current !== generation.current)
                return;
            if ('error' in next) {
                setError(next.error || 'Could not load release. Try again.');
                return;
            }
            setView(next);
            setError('');
        }
        catch {
            if (current === generation.current)
                setError('Could not load release. Try again.');
        }
    }, [requestId, orgId]);
    useEffect(() => {
        let active = true;
        actions.readRequestRelease(requestId, { orgId }).then(next => {
            if (!active) return;
            if ('error' in next) setError(next.error || 'Could not load release. Try again.');
            else { setView(next); setError(''); }
        }).catch(() => { if (active) setError('Could not load release. Try again.'); });
        return () => { active = false; };
    }, [requestId, orgId, revision]);
    // Refresh on return and at the next UTC date boundary, without server polling or cron.
    useEffect(() => {
        if (!view)
            return;
        const focus = () => { if (!running.current)
            void reload(); };
        const midnight = Date.parse(view.today + 'T00:00:00Z') + 86400000;
        const timer = window.setTimeout(focus, Math.max(1000, midnight - Date.now()));
        window.addEventListener('focus', focus);
        return () => { clearTimeout(timer); window.removeEventListener('focus', focus); };
    }, [view, reload]);
    async function save(input: ReleaseChange) {
        if (!view || running.current)
            return;
        running.current = true;
        setBusy(true);
        setError('');
        const fingerprint = JSON.stringify(input);
        if (retry.current?.fingerprint !== fingerprint)
            retry.current = { fingerprint, operationId: crypto.randomUUID(), expectedRevision: view.revision };
        try {
            const retryContext = retry.current;
            const outcome = await runAction({
                id: requestId, refreshOnError: false,
                run: () => actions.changeRequestRelease({ orgId, requestId, operationId: retryContext.operationId, expectedRevision: retryContext.expectedRevision }, input),
                onError: message => setError(message),
            });
            if (outcome.status !== 'success') {
                if (outcome.status === 'error' && outcome.error.includes('Reload')) retry.current = null;
                return;
            }
            const result = outcome.value;
            if ('error' in result) {
                setError(result.error);
                if (result.error.includes('Reload'))
                    retry.current = null;
                return;
            }
            retry.current = null;
            setMode(null);
            setConfirmed(false);
            setReason('');
            await reload();
            heading.current?.focus();
        }
        catch {
            setError('Could not save release. Your input is preserved; try again.');
        }
        finally {
            running.current = false;
            setBusy(false);
        }
    }
    // Release is only a question once the work is Done.
    if (!error && (!view || !view.done))
        return null;
    return <section className={styles.panel} aria-labelledby="release-heading" aria-busy={busy}>
   <div className={styles.header}><h2 id="release-heading" tabIndex={-1} ref={heading}>Release and measurement</h2></div>
   {error && <p role="alert">{error}</p>}
   {!view ? <p role="status">{error ? 'Release details unavailable.' : 'Loading release…'}</p> : <>
     <p className={styles.muted}>Release and outcome owner: {view.ownerName}</p>
     {view.release ? <div className={styles.facts}>
       <p>Released to {view.release.audience} on <time dateTime={view.release.exposureDate}>{view.release.exposureDate}</time> (UTC).</p>
       <p>{view.release.evidence}</p>
       <p>Measurement due: <time dateTime={view.release.dueDate + 'T00:00:00Z'}>{view.release.dueDate} at 00:00 UTC</time></p>
       <p role="status">{view.measurement?.label}</p>
       {view.release.windowKind === 'fixed' && <p className={styles.muted}>Agreed fixed window: {view.release.startDate} to {view.release.dueDate}. Release timing does not move these dates.</p>}
       <p className={styles.muted}>The deadline does not close this Request automatically.</p>
       {view.canCorrect && <div className={styles.controls}>
         <Button variant="secondary" disabled={busy} onClick={() => { setMode('correct'); setDate(view.release!.exposureDate); setEvidence(view.release!.evidence); setConfirmed(false); }}>Correct release</Button>
         <Button variant="ghost" disabled={busy} onClick={() => { setMode('void'); setConfirmed(false); }}>Void incorrect release</Button>
       </div>}
     </div> : <p>{view.blocked ?? 'Not released. Record release when the agreed audience has received the completed work.'}</p>}
     {(view.canRelease || (view.canCorrect && mode === 'correct')) && <form className={styles.stack} onSubmit={e => { e.preventDefault(); if (!confirmed)
                return; void save(mode === 'correct' ? { kind: 'correct', exposureDate: date, evidence, audienceConfirmed: true, reason } : { kind: 'release', exposureDate: date, evidence, audienceConfirmed: true }); }}>
       <p>Agreed audience: {view.audience}</p>
       <Input label="Actual exposure date (UTC)" type="date" required min={view.earliestExposure ?? undefined} max={view.today} value={date} onChange={e => setDate(e.target.value)} disabled={busy}/>
       <Textarea label="Release evidence" required maxLength={4000} value={evidence} onChange={e => setEvidence(e.target.value)} disabled={busy} description="Record where the agreed audience exposure can be checked. Deployment alone is not release."/>
       <Checkbox label="The agreed audience received this work" checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} disabled={busy}/>
       {mode === 'correct' && <Textarea label="Correction reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} description="The original stays in history. Relative deadlines are recalculated; fixed dates stay unchanged."/>}
       <div className={styles.controls}><Button type="submit" disabled={busy || !confirmed}>{busy ? 'Saving release…' : mode === 'correct' ? 'Save correction' : 'Mark as released'}</Button>{mode && <Button variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancel correction</Button>}</div>
     </form>}
     {view.canCorrect && mode === 'void' && <form className={styles.stack} onSubmit={e => { e.preventDefault(); if (confirmed)
                void save({ kind: 'void', reason, neverExposed: true }); }}>
       <p>Void only a release that never happened. If work was exposed and later rolled back, the release remains part of its measurement history.</p>
       <Textarea label="Void reason" required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy}/>
       <Checkbox label="The agreed audience was never exposed" checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} disabled={busy}/>
       <div className={styles.controls}><Button type="submit" disabled={busy || !confirmed}>Confirm void</Button><Button variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancel void</Button></div>
     </form>}
     {view.canTransfer && <form className={styles.stack} onSubmit={e => { e.preventDefault(); void save({ kind: 'transfer', recipientId: recipient, reason: transferReason }); }}>
       <p>The current owner no longer has eligible workspace access. Transfer responsibility without changing original authorship or agreement.</p>
       <Select label="New release and outcome owner" options={view.people.map(p => ({ value: p.id, label: p.name }))} value={recipient} onValueChange={setRecipient} disabled={busy}/>
       <Textarea label="Transfer reason" required maxLength={4000} value={transferReason} onChange={e => setTransferReason(e.target.value)} disabled={busy}/>
       <Button type="submit" disabled={busy || !recipient}>Transfer responsibility</Button>
     </form>}
     {!!view.history.length && <details><summary>Release history ({view.history.length})</summary><ol>{view.history.map(event => <li key={event.revision}>
       <p>{event.input.kind === 'transfer' ? 'Responsibility transferred' : event.input.kind === 'void' ? 'Incorrect release voided' : event.input.kind === 'correct' ? 'Release corrected' : 'Release recorded'} by {view.names[event.actorId]} on <time dateTime={event.at}>{event.at}</time>.</p>
       {'reason' in event.input && <p>{event.input.reason}</p>}
       {event.input.kind === 'transfer' && <p>{view.names[event.previousOwnerId]} → {view.names[event.ownerId]}</p>}
       {event.release && <p>Exposure: {event.release.exposureDate}. Audience: {event.release.audience}. Due: {event.release.dueDate} (UTC). Evidence: {event.release.evidence}</p>}
     </li>)}</ol></details>}
   </>}
 </section>;
}
