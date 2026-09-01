import React, { useEffect, useState } from 'react';
import { ArrowRight, Eye, KeyRound, Lock, Radio, RotateCcw, Unlock } from 'lucide-react';
import {
  SCENE1_KEY,
  SCENE1_MESSAGE,
  decryptWithSharedKey,
  encryptWithSharedKey,
} from './campaignScene1Logic';
import {
  SCENE1_STEPS,
  advanceScene1,
  currentScene1Step,
  initialScene1,
  isScene1Finished,
  Scene1Step,
} from './campaignScene1Tutorial';
import { markSceneComplete } from './campaignProgress';

interface CampaignScene1Props {
  onNext: () => void;
  onExit: () => void;
}

const SPEAKER_INFO: Record<Scene1Step['speaker'], { label: string; glow: string }> = {
  alice: { label: 'ALICE', glow: '#60a5fa' },
  bob: { label: 'BOB', glow: '#34d399' },
  eve: { label: 'EVE', glow: '#fb7185' },
  system: { label: 'SYSTEM', glow: '#818cf8' },
};

function SharedKeyLine({ revealed, onReveal }: { revealed: boolean; onReveal: () => void }) {
  return (
    <div className="text-xs ink-3 flex items-center gap-1.5">
      <KeyRound size={13} /> Shared key:
      {revealed ? (
        <span className="font-mono ink-1">{SCENE1_KEY}</span>
      ) : (
        <button onClick={onReveal} className="btn btn-ghost px-2 py-0.5 text-[10px] inline-flex items-center gap-1">
          <Eye size={11} /> •• Reveal
        </button>
      )}
    </div>
  );
}

export function CampaignScene1({ onNext, onExit }: CampaignScene1Props) {
  const [tutorial, setTutorial] = useState(initialScene1());
  const [message, setMessage] = useState(SCENE1_MESSAGE);
  const [ciphertext, setCiphertext] = useState<string | null>(null);
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [intercepting, setIntercepting] = useState(false);

  const step = currentScene1Step(tutorial);
  const finished = isScene1Finished(tutorial);

  useEffect(() => {
    if (finished) markSceneComplete('scene1');
  }, [finished]);

  const encrypt = () => setCiphertext(encryptWithSharedKey(message, SCENE1_KEY));
  const decrypt = () => {
    if (!ciphertext) return;
    setDecrypted(decryptWithSharedKey(ciphertext, SCENE1_KEY));
  };

  const advance = (event: Parameters<typeof advanceScene1>[1]) => setTutorial((t) => advanceScene1(t, event));

  const watchIntercept = () => {
    if (intercepting) return;
    setIntercepting(true);
    window.setTimeout(() => {
      setIntercepting(false);
      advance('key-intercepted');
    }, 900);
  };

  const restart = () => {
    setTutorial(initialScene1());
    setMessage(SCENE1_MESSAGE);
    setCiphertext(null);
    setDecrypted(null);
    setKeyRevealed(false);
    setIntercepting(false);
  };

  return (
    <div className="bg-scene bg-mesh min-h-full px-4 py-10 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="a-rise flex items-start justify-between gap-4">
          <div>
            <div className="label-mono mb-2">Quantum Breach · Scene 1 of 3</div>
            <h1 className="h-display text-4xl md:text-5xl text-grad">Symmetric Cryptography</h1>
            <p className="text-sm ink-2 mt-2 max-w-xl leading-relaxed">One secret. Two people.</p>
          </div>
          <button onClick={onExit} className="btn btn-ghost px-4 py-2 text-xs shrink-0">
            Exit
          </button>
        </header>

        <div className="label-mono">
          Step {Math.min(tutorial.index + 1, SCENE1_STEPS.length)} of {SCENE1_STEPS.length}
        </div>

        {!finished && step && (
          <div className="a-pop card sheen glass rounded-[22px] p-6 space-y-5" style={{ ['--glow' as string]: SPEAKER_INFO[step.speaker].glow }}>
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

            {step.id === 'alice-encrypts' && (
              <div className="panel rounded-xl p-4 space-y-3">
                {ciphertext === null ? (
                  <>
                    <label className="label-mono block">Message</label>
                    <input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full panel rounded-lg px-3 py-2.5 text-sm font-mono ink-1 outline-none focus:border-[var(--accent)] transition-colors"
                    />
                    <SharedKeyLine revealed={keyRevealed} onReveal={() => setKeyRevealed(true)} />
                    <button onClick={encrypt} className="btn btn-primary px-5 py-2.5 text-sm">
                      Encrypt <Lock size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-sm ink-1">
                      Ciphertext: <span className="font-mono">{ciphertext}</span>
                    </div>
                    <button onClick={() => advance('message-encrypted')} className="btn btn-primary px-5 py-2.5 text-sm">
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {step.id === 'bob-decrypts' && ciphertext && (
              <div className="panel rounded-xl p-4 space-y-3">
                {decrypted === null ? (
                  <>
                    <label className="label-mono block">Received (ciphertext)</label>
                    <pre className="panel rounded-lg px-3 py-2.5 text-sm font-mono ink-1 whitespace-pre-wrap">{ciphertext}</pre>
                    <SharedKeyLine revealed={keyRevealed} onReveal={() => setKeyRevealed(true)} />
                    <button onClick={decrypt} className="btn btn-primary px-5 py-2.5 text-sm">
                      Decrypt <Unlock size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-sm ink-1">
                      Recovered: <span className="font-mono" style={{ color: 'var(--ok)' }}>{decrypted}</span>
                    </div>
                    <button onClick={() => advance('message-decrypted')} className="btn btn-primary px-5 py-2.5 text-sm">
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {step.id === 'eve-appears' && (
              <div className="panel rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-center gap-4 text-xs font-mono ink-2">
                  <span className="flex flex-col items-center gap-1">
                    <span className="grid place-items-center w-10 h-10 rounded-full" style={{ background: 'color-mix(in oklab, #60a5fa 16%, transparent)', color: '#60a5fa' }}>A</span>
                    Alice
                  </span>
                  <ArrowRight size={16} className="ink-3" />
                  <span className="flex flex-col items-center gap-1">
                    <KeyRound size={20} style={{ color: '#fb7185' }} className={intercepting ? 'a-intercept-key' : 'a-float'} />
                    key
                  </span>
                  <ArrowRight size={16} className="ink-3" />
                  <span className="flex flex-col items-center gap-1">
                    <span
                      className={`grid place-items-center w-10 h-10 rounded-full ${intercepting ? 'a-intercept-flash' : ''}`}
                      style={{ background: 'color-mix(in oklab, #fb7185 16%, transparent)', color: '#fb7185' }}
                    >
                      E
                    </span>
                    Eve
                  </span>
                  <ArrowRight size={16} className="ink-3" />
                  <span className="flex flex-col items-center gap-1">
                    <span className="grid place-items-center w-10 h-10 rounded-full" style={{ background: 'color-mix(in oklab, #34d399 16%, transparent)', color: '#34d399' }}>B</span>
                    Bob
                  </span>
                </div>
                <button
                  onClick={watchIntercept}
                  disabled={intercepting}
                  className="btn btn-primary px-5 py-2.5 text-sm mx-auto disabled:opacity-60"
                >
                  <Radio size={14} /> {intercepting ? 'Intercepting…' : 'Watch the intercept'}
                </button>
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
            <h2 className="h-section text-xl ink-1">On to Scene 2</h2>
            <p className="text-sm ink-2 leading-relaxed">
              A shared key that has to travel over the same channel as the message is only as safe as that
              channel. Time to see if a lock anyone can use — but only one person can open — solves it.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button onClick={restart} className="btn btn-ghost px-5 py-2.5 text-sm">
                <RotateCcw size={14} /> Replay this scene
              </button>
              <button onClick={onNext} className="btn btn-primary px-6 py-3 text-sm">
                Continue to Scene 2 <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
