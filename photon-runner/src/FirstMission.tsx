import React, { useEffect, useState } from 'react';
import { ArrowRight, Eye, Radio, RotateCcw, Shield, Unlock } from 'lucide-react';
import { arm, captureReady, createSession, currentQBER, extract, isWin, keyFraction, MIN_CAPTURE_PULSES, stepExchange, TARGETS, type AttackMode } from './qkdAttack';
import { ASSIGNMENTS, completeAssignment, readFacilityStory, saveFacilityStory } from './facilityStory';

/** A small, replayable mission using the same rules as the headquarters console. */
export function FirstMission({ onContinue, onExit }: { onContinue: () => void; onExit: () => void }) {
  const [session, setSession] = useState(() => createSession(TARGETS[0]));
  const [tool, setTool] = useState<AttackMode>('intercept');
  const won = isWin(session);
  const caught = session.status === 'caught';
  const finished = session.status !== 'active';
  const ready = captureReady(session);
  const fraction = keyFraction(session);
  const error = currentQBER(session);

  useEffect(() => {
    if (!won) return;
    // Replays must never erase progress earned in the rest of the facility.
    const previous = readFacilityStory();
    saveFacilityStory(completeAssignment({ ...previous, access: true }, session, 'ops'));
  }, [won, session]);

  const retry = () => setSession(createSession(TARGETS[0]));
  const send = () => setSession(s => stepExchange(arm({ ...s, armed: [] }, tool, 1), 500).state);
  const feedback = won ? 'Clue recovered. Your team now knows where to meet.'
    : caught ? 'Spotted! Reading the signal changed it. The receiver noticed the errors and closed the link.'
    : ready ? 'You have enough evidence. Extract the clue, or keep experimenting with the link.'
    : session.round > 0 ? 'Your tool left no errors this time. Stay connected for one more burst to finish the capture.'
    : 'Pick a tool and send a burst. Watch what changes at the receiver.';

  return <div className="first-mission">
    <header className="mission-header">
      <div><p className="label-mono">Operation 01 · Training link</p><h1>Find the meeting place.</h1></div>
      <button className="btn btn-ghost px-4 py-2" onClick={onExit}>Exit</button>
    </header>
    <p className="mission-intro">Your team’s rendezvous clue is locked. Test the link, steal enough of its training key, and get out before the receiver spots you.</p>

    <section className="mission-channel" aria-label="Live signal">
      <div className="mission-endpoint"><Radio aria-hidden="true" /><strong>Sender</strong><span>Secret signal</span></div>
      <div key={`sender-${session.round}`} className={`mission-wire ${session.round ? 'mission-wire-active' : ''}`} aria-hidden="true"><span /><span /><span /></div>
      <div className={`mission-endpoint mission-tap ${caught ? 'mission-spotted' : ''}`}><Eye aria-hidden="true" /><strong>You</strong><span>{won ? 'Clue recovered' : caught ? 'Spotted' : session.round ? 'Signal captured' : 'Choose your tool'}</span></div>
      <div key={`receiver-${session.round}`} className={`mission-wire ${session.round ? 'mission-wire-active' : ''} ${caught ? 'mission-wire-errors' : ''}`} aria-hidden="true"><span /><span /><span /></div>
      <div className="mission-endpoint"><Shield aria-hidden="true" /><strong>Receiver</strong><span>{caught ? 'Link closed' : error > 0 ? 'Errors found' : session.round ? 'No errors seen' : 'Listening'}</span></div>
    </section>

    <div className="mission-meters">
      <Meter label="Key learned" value={fraction} detail={`${Math.round(fraction * 100)}% · need 30%`} />
      <Meter label="Receiver errors" value={error / session.target.abortQBER} detail={`${Math.round(error * 100)}% · spotted at 11%`} danger />
      <Meter label="Capture length" value={session.round / MIN_CAPTURE_PULSES} detail={`${Math.min(session.round, MIN_CAPTURE_PULSES)} / ${MIN_CAPTURE_PULSES} pulses`} />
    </div>

    <p role="status" className={`mission-feedback ${caught ? 'mission-feedback-danger' : ''}`}>{feedback}</p>

    {won ? <section className="mission-reward">
      <Unlock size={32} aria-hidden="true" /><p className="label-mono">Rendezvous clue unlocked</p>
      <h2>{ASSIGNMENTS[0].reward}</h2>
      <p>Your access card and first assignment are saved. The next link has extra defences: inspect it before reusing your plan.</p>
      <div className="flex flex-wrap gap-3"><button className="btn btn-primary px-5 py-3" onClick={onContinue}>Take the next assignment <ArrowRight size={16} /></button><button className="btn btn-ghost px-4 py-3" onClick={retry}>Replay and experiment</button></div>
    </section> : <>
      <div className="mission-tools" role="group" aria-label="Choose your tool">
        <Tool name="Read and resend" description="Read the signal, then pass it on. Your measurement can leave errors." selected={tool === 'intercept'} disabled={finished} onClick={() => setTool('intercept')} />
        <Tool name="Dazzle the detector" description="Control what this unprotected receiver sees. A detector monitor could spot this trick." selected={tool === 'blind'} disabled={finished} onClick={() => setTool('blind')} />
      </div>
      <div className="mission-actions">
        {caught ? <button className="btn btn-primary px-5 py-3" onClick={retry}><RotateCcw size={16} /> Try a different tool</button>
          : <><button className="btn btn-primary px-5 py-3" onClick={send} disabled={finished}>Send a burst</button><button className="btn btn-ghost px-5 py-3" onClick={() => setSession(extract(session))} disabled={!ready || finished}>Extract the clue <Unlock size={16} /></button></>}
        <span className="text-sm ink-2">No timer. A failed attempt costs no progress.</span>
      </div>
    </>}
    <details className="mission-explanation"><summary>What just happened?</summary><p>“Read and resend” is intercept–resend: guessing how to measure a photon introduces errors. “Dazzle” is detector blinding: it exploits unprotected hardware without creating those errors. This training link has no detector monitor; later links do. A quiet error meter alone does not prove a link is safe.</p><p>The clue is a mission reward for meeting the capture goal; it is not a claim that a partial quantum key decrypts a real message.</p></details>
  </div>;
}

function Tool({ name, description, selected, disabled, onClick }: { name: string; description: string; selected: boolean; disabled: boolean; onClick: () => void }) {
  return <button className="mission-tool" aria-pressed={selected} disabled={disabled} onClick={onClick}><strong>{name}</strong><span>{description}</span></button>;
}

function Meter({ label, value, detail, danger = false }: { label: string; value: number; detail: string; danger?: boolean }) {
  return <div className="mission-meter"><strong>{label}</strong><div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(1, value)) * 100)}><span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: danger ? '#fb7185' : '#5eead4' }} /></div><span>{detail}</span></div>;
}
