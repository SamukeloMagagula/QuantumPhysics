import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, KeyRound, Lock, RotateCcw, ShieldAlert, Unlock } from 'lucide-react';
import { BOB_KEYS, EVE_KEYS, SCENE2_MESSAGE, SCENE2_MESSAGE_LABEL, simulateMitm } from './campaignScene2Logic';
import {
  SCENE2_STEPS,
  Scene2Step,
  advanceScene2,
  currentScene2Step,
  initialScene2,
  isScene2Finished,
} from './campaignScene2Tutorial';
import { markSceneComplete } from './campaignProgress';

interface CampaignScene2Props {
  onNext: () => void;
  onExit: () => void;
}

const SPEAKER_INFO: Record<Scene2Step['speaker'], { label: string; glow: string }> = {
  alice: { label: 'ALICE', glow: '#60a5fa' },
  bob: { label: 'BOB', glow: '#34d399' },
  eve: { label: 'EVE', glow: '#fb7185' },
  system: { label: 'SYSTEM', glow: '#818cf8' },
};

export function CampaignScene2({ onNext, onExit }: CampaignScene2Props) {
  const [tutorial, setTutorial] = useState(initialScene2());
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  // Both flows are precomputed from the same tested simulateMitm() — the UI
  // only decides, per beat, which already-true fact to reveal to the player.
  const clean = useMemo(() => simulateMitm(SCENE2_MESSAGE, BOB_KEYS, EVE_KEYS, false), []);
  const mitm = useMemo(() => simulateMitm(SCENE2_MESSAGE, BOB_KEYS, EVE_KEYS, true), []);

  const step = currentScene2Step(tutorial);
  const finished = isScene2Finished(tutorial);

  useEffect(() => {
    if (finished) markSceneComplete('scene2');
  }, [finished]);

  const reveal = (id: string) => setRevealed((r) => ({ ...r, [id]: true }));
  const advance = (event: Parameters<typeof advanceScene2>[1]) => setTutorial((t) => advanceScene2(t, event));
  const restart = () => {
    setTutorial(initialScene2());
    setRevealed({});
  };

  return (
    <div className="bg-scene bg-mesh min-h-full px-4 py-10 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="a-rise flex items-start justify-between gap-4">
          <div>
            <div className="label-mono mb-2">Quantum Breach · Scene 2 of 3</div>
            <h1 className="h-display text-4xl md:text-5xl text-grad">Asymmetric Cryptography</h1>
            <p className="text-sm ink-2 mt-2 max-w-xl leading-relaxed">You can share the lock.</p>
          </div>
          <button onClick={onExit} className="btn btn-ghost px-4 py-2 text-xs shrink-0">
            Exit
          </button>
        </header>

        <div className="label-mono">
          Step {Math.min(tutorial.index + 1, SCENE2_STEPS.length)} of {SCENE2_STEPS.length}
        </div>

        {!finished && step && (
          <div
            className="a-pop card sheen glass rounded-[22px] p-6 space-y-5"
            style={{ ['--glow' as string]: SPEAKER_INFO[step.speaker].glow }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="text-[10px] font-mono font-bold px-2 py-1 rounded-md tracking-wider"
                style={{
                  background: `color-mix(in oklab, ${SPEAKER_INFO[step.speaker].glow} 16%, transparent)`,
                  color: SPEAKER_INFO[step.speaker].glow,
                  border: `1px solid color-mix(in oklab, ${SPEAKER_INFO[step.speaker].glow} 30%, transparent)`,
                }}
              >
                {SPEAKER_INFO[step.speaker].label}
              </span>
              <h2 className="h-section text-lg ink-1">{step.title}</h2>
            </div>
            <p className="text-sm ink-2 leading-relaxed">{step.body}</p>

            {step.id === 'bob-generates' && (
              <div className="panel rounded-xl p-4 space-y-3">
                {!revealed['bob-generates'] ? (
                  <button onClick={() => reveal('bob-generates')} className="btn btn-primary px-5 py-2.5 text-sm">
                    Generate Keypair <KeyRound size={14} />
                  </button>
                ) : (
                  <>
                    <div className="text-sm font-mono ink-1 space-y-1">
                      <div>Public key (n, e) = ({BOB_KEYS.n}, {BOB_KEYS.e}) — published</div>
                      <div>Private key d = {BOB_KEYS.d} — kept secret</div>
                    </div>
                    <button onClick={() => advance('keypair-generated')} className="btn btn-primary px-5 py-2.5 text-sm">
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {step.id === 'alice-encrypts' && (
              <div className="panel rounded-xl p-4 space-y-3">
                <div className="text-xs ink-3">Bob's public key: (n, e) = ({BOB_KEYS.n}, {BOB_KEYS.e})</div>
                <div className="text-sm font-mono ink-1">Message: "{SCENE2_MESSAGE_LABEL}"</div>
                {!revealed['alice-encrypts'] ? (
                  <button onClick={() => reveal('alice-encrypts')} className="btn btn-primary px-5 py-2.5 text-sm">
                    Encrypt with Bob's public key <Lock size={14} />
                  </button>
                ) : (
                  <>
                    <div className="text-sm ink-1">
                      Ciphertext: <span className="font-mono">{clean.eveInterceptedCiphertext}</span>
                    </div>
                    <button onClick={() => advance('message-encrypted')} className="btn btn-primary px-5 py-2.5 text-sm">
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {step.id === 'eve-fails' && (
              <div className="panel rounded-xl p-4 space-y-3">
                <div className="text-sm ink-1">
                  Intercepted: <span className="font-mono">{clean.eveInterceptedCiphertext}</span>
                </div>
                {!revealed['eve-fails'] ? (
                  <button onClick={() => reveal('eve-fails')} className="btn btn-primary px-5 py-2.5 text-sm">
                    Try to decrypt <Unlock size={14} />
                  </button>
                ) : (
                  <>
                    <div className="text-sm" style={{ color: 'var(--danger)' }}>
                      Decryption failed — Eve doesn't hold Bob's private key.
                    </div>
                    <button onClick={() => advance('eve-decrypt-failed')} className="btn btn-primary px-5 py-2.5 text-sm">
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {step.id === 'mitm-swap' && (
              <div className="panel rounded-xl p-4 space-y-3">
                {!revealed['mitm-swap'] ? (
                  <button onClick={() => reveal('mitm-swap')} className="btn btn-primary px-5 py-2.5 text-sm">
                    Forge a keypair &amp; send it to Alice <ShieldAlert size={14} />
                  </button>
                ) : (
                  <>
                    <div className="text-sm font-mono ink-1">
                      Eve's fake "Bob" public key: (n, e) = ({EVE_KEYS.n}, {EVE_KEYS.e})
                    </div>
                    <button onClick={() => advance('mitm-key-swapped')} className="btn btn-primary px-5 py-2.5 text-sm">
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {step.id === 'mitm-alice-encrypts' && (
              <div className="panel rounded-xl p-4 space-y-3">
                <div className="text-xs ink-3">
                  "Bob's public key": (n, e) = ({EVE_KEYS.n}, {EVE_KEYS.e})
                </div>
                {!revealed['mitm-alice-encrypts'] ? (
                  <button onClick={() => reveal('mitm-alice-encrypts')} className="btn btn-primary px-5 py-2.5 text-sm">
                    Encrypt &amp; send <Lock size={14} />
                  </button>
                ) : (
                  <>
                    <div className="text-sm ink-1">
                      Ciphertext: <span className="font-mono">{mitm.eveInterceptedCiphertext}</span>
                    </div>
                    <button onClick={() => advance('mitm-message-encrypted')} className="btn btn-primary px-5 py-2.5 text-sm">
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {step.id === 'mitm-eve-reads' && (
              <div className="panel rounded-xl p-4 space-y-3">
                {!revealed['mitm-eve-reads'] ? (
                  <button onClick={() => reveal('mitm-eve-reads')} className="btn btn-primary px-5 py-2.5 text-sm">
                    Decrypt with her real private key <Unlock size={14} />
                  </button>
                ) : (
                  <>
                    <div className="text-sm" style={{ color: 'var(--danger)' }}>
                      Eve reads it: "{SCENE2_MESSAGE_LABEL}"
                    </div>
                    <button onClick={() => advance('mitm-decrypted-by-eve')} className="btn btn-primary px-5 py-2.5 text-sm">
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {step.id === 'mitm-forward' && (
              <div className="panel rounded-xl p-4 space-y-3">
                {!revealed['mitm-forward'] ? (
                  <button onClick={() => reveal('mitm-forward')} className="btn btn-primary px-5 py-2.5 text-sm">
                    Re-encrypt with Bob's real key &amp; forward <Lock size={14} />
                  </button>
                ) : (
                  <>
                    <div className="text-sm ink-1">
                      Forwarded ciphertext: <span className="font-mono">{clean.eveInterceptedCiphertext}</span> — identical
                      to a clean message. Nothing on the wire gives Eve away.
                    </div>
                    <button onClick={() => advance('mitm-forwarded')} className="btn btn-primary px-5 py-2.5 text-sm">
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {step.id === 'mitm-bob-decrypts' && (
              <div className="panel rounded-xl p-4 space-y-3">
                {!revealed['mitm-bob-decrypts'] ? (
                  <button onClick={() => reveal('mitm-bob-decrypts')} className="btn btn-primary px-5 py-2.5 text-sm">
                    Decrypt with his private key <Unlock size={14} />
                  </button>
                ) : (
                  <>
                    <div className="text-sm ink-1">
                      Recovered: <span className="font-mono" style={{ color: 'var(--ok)' }}>"{SCENE2_MESSAGE_LABEL}"</span> —
                      reads perfectly normal. Bob has no idea Eve read it first.
                    </div>
                    <button onClick={() => advance('bob-decrypted')} className="btn btn-primary px-5 py-2.5 text-sm">
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {step.trigger.kind === 'continue' && (
              <button onClick={() => advance('continue')} className="btn btn-primary px-5 py-2.5 text-sm">
                Continue <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}

        {finished && (
          <div className="a-pop card sheen glass rounded-[22px] p-6 space-y-4 text-center" style={{ ['--glow' as string]: '#818cf8' }}>
            <h2 className="h-section text-xl ink-1">Scene 3: Quantum Breach</h2>
            <p className="text-sm ink-2 leading-relaxed">
              What if the key itself could tell you when someone was spying on you? Step into a real BB84
              quantum key exchange — as Alice, Bob, or Eve.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button onClick={restart} className="btn btn-ghost px-5 py-2.5 text-sm">
                <RotateCcw size={14} /> Replay this scene
              </button>
              <button onClick={onNext} className="btn btn-primary px-6 py-3 text-sm">
                Continue to Quantum Breach <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
