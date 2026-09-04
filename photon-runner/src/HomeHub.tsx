import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Eye,
  FlaskConical,
  Lock,
  Palette,
  Radio,
  Shield,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { getAppearance } from './characterAppearance';
import { getCompletedScenes } from './campaignProgress';
import { useTilt } from './useTilt';

export type ModeId =
  | 'campus'
  | 'qkd-attack'
  | 'labs'
  | 'quantum'
  | 'defender'
  | 'customize'
  | 'rooms'
  | 'qkd-multiplayer'
  | 'campaign';

interface HomeHubProps {
  onOpen: (mode: ModeId) => void;
}

interface ModeCard {
  id: ModeId;
  title: string;
  tag: string;
  blurb: string;
  Icon: React.ComponentType<{ size?: number }>;
  glow: string;
}

const FEATURED: ModeCard = {
  id: 'qkd-attack',
  title: 'Phantom Q Headquarters',
  tag: 'Hacking sim · walk-in HQ',
  blurb:
    'Walk the Phantom Q operations floor and step up to a console. You are Eve on a fibre BB84 link: tap the communications desk, find the countermeasure the target is missing, and build an attack out of what it cannot see — photon-number splitting, detector blinding, a trojan probe. Then read the headquarters status wall and work out who was listening.',
  Icon: Eye,
  glow: '#fb7185',
};

const MODES: ModeCard[] = [
  {
    id: 'campus',
    title: 'Research Campus',
    tag: 'Explore · 3D hub',
    blurb:
      'Walk the grounds outside the facility — Quantum Lab, Security, the Research Lab, the Server Room — and step through a door to open that world.',
    Icon: Building2,
    glow: '#34d399',
  },
  {
    id: 'campaign',
    title: 'Quantum Breach',
    tag: 'Story campaign · single-player',
    blurb:
      'Learn symmetric and asymmetric cryptography the hard way — watch a shared key get intercepted, then a public key get spoofed — before you walk into a real BB84 exchange as Alice, Bob, or Eve.',
    Icon: Lock,
    glow: '#818cf8',
  },
  {
    id: 'qkd-multiplayer',
    title: 'Quantum Intercept',
    tag: 'Multiplayer · 2-3 players',
    blurb: 'A real BB84 key exchange over the network — Alice sends, Bob receives, Eve secretly taps the line.',
    Icon: Radio,
    glow: '#60a5fa',
  },
  {
    id: 'rooms',
    title: 'Symmetric Cryptography',
    tag: '4-room learning path',
    blurb: 'Content-driven rooms that build on each other — Caesar, brute force, frequency analysis, XOR/OTP. Points, badges, leaderboard.',
    Icon: BookOpen,
    glow: '#22d3ee',
  },
  {
    id: 'quantum',
    title: 'Quantum 3D Lab',
    tag: 'Sandbox',
    blurb: 'An optical bench you can touch — polarization, superposition, and a live intercept readout.',
    Icon: Sparkles,
    glow: '#fbbf24',
  },
  {
    id: 'labs',
    title: 'Security Labs',
    tag: '8 hands-on labs',
    blurb: 'Carry out real scaled-down attacks: SQLi, XSS, phishing, RSA, password cracking, evil twin.',
    Icon: FlaskConical,
    glow: '#a78bfa',
  },
  {
    id: 'defender',
    title: 'Network Defender',
    tag: 'Arcade',
    blurb: 'Hold the perimeter as intrusions escalate. A short reflex round between runs.',
    Icon: Shield,
    glow: '#34d399',
  },
  {
    id: 'customize',
    title: 'Character Creator',
    tag: 'Appearance',
    blurb: 'Skin, hair, build, outfits and gear. Your operative carries into every mode.',
    Icon: Palette,
    glow: '#f472b6',
  },
];

/** A mode card with a mouse-tracked 3D tilt — split out from the MODES.map()
 * loop because useTilt() is a hook and hooks can't run inside a loop body. */
function ModeCardButton({
  mode,
  tag,
  index,
  showComplete,
  onOpen,
}: {
  mode: ModeCard;
  tag: string;
  index: number;
  showComplete: boolean;
  onOpen: (id: ModeId) => void;
}) {
  const tilt = useTilt(7);
  return (
    <button
      ref={tilt.ref as React.RefObject<HTMLButtonElement>}
      onClick={() => onOpen(mode.id)}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      style={{ ['--glow' as string]: mode.glow, ['--i' as string]: index + 1 }}
      className="card sheen glass group rounded-[22px] p-5 text-left flex flex-col gap-3 min-h-[204px]"
    >
      <div className="flex items-center justify-between">
        <span
          className="grid place-items-center w-11 h-11 rounded-2xl transition-transform duration-300 group-hover:scale-110"
          style={{ background: `color-mix(in oklab, ${mode.glow} 15%, transparent)`, color: mode.glow }}
        >
          <mode.Icon size={21} />
        </span>
        {showComplete && (
          <span className="shrink-0" style={{ color: 'var(--ok)' }}>
            <Check size={14} />
          </span>
        )}
      </div>

      <div>
        <h3 className="h-section text-base ink-1">{mode.title}</h3>
        <div className="label-mono !text-[9px] mt-0.5">{tag}</div>
      </div>

      <p className="text-xs ink-3 leading-relaxed flex-1">{mode.blurb}</p>

      <span className="text-[11px] ink-4 group-hover:ink-1 transition-colors flex items-center gap-1">
        Open <ArrowRight size={11} />
      </span>
    </button>
  );
}

function PhotonRail() {
  return (
    <div className="relative h-px w-full max-w-md mx-auto my-5 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(90deg, transparent, color-mix(in oklab, var(--accent) 55%, transparent), transparent)' }}
      />
      {[0, 0.95, 1.9].map((d, i) => (
        <span
          key={i}
          className="a-streak absolute top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full"
          style={{
            animationDelay: `${d}s`,
            background: 'var(--accent)',
            boxShadow: '0 0 12px 3px color-mix(in oklab, var(--accent) 70%, transparent)',
          }}
        />
      ))}
    </div>
  );
}

export function HomeHub({ onOpen }: HomeHubProps) {
  const you = getAppearance();
  const campaignDone = getCompletedScenes();
  const campaignTag = !campaignDone.includes('scene1')
    ? 'Story campaign · single-player'
    : !campaignDone.includes('scene2')
    ? 'Continue · Scene 2 of 3'
    : 'Completed · replay anytime';

  return (
    <div className="bg-scene bg-mesh min-h-full px-4 py-12 md:px-8 md:py-16">
      <div className="max-w-6xl mx-auto">
        <header className="a-rise text-center mb-11">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono tracking-[0.16em] uppercase mb-6"
            style={{
              border: '1px solid color-mix(in oklab, var(--accent) 30%, transparent)',
              background: 'color-mix(in oklab, var(--accent) 8%, transparent)',
              color: 'var(--accent)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
            BB84 quantum cryptography
          </div>

          <h1 className="h-display text-6xl md:text-8xl text-grad">QUANTUM LAB</h1>
          <PhotonRail />
          <p className="text-sm md:text-base ink-2 max-w-xl mx-auto leading-relaxed">
            Learn how quantum key distribution actually works by playing it — as the sender, the
            receiver, or the spy that physics gives away.
          </p>
        </header>

        {/* -------- featured -------- */}
        <button
          onClick={() => onOpen(FEATURED.id)}
          style={{ ['--glow' as string]: FEATURED.glow }}
          className="a-pop card sheen glass group w-full text-left rounded-[28px] p-6 md:p-9 mb-4"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div
              className="a-float grid place-items-center w-20 h-20 rounded-3xl shrink-0"
              style={{ background: `color-mix(in oklab, ${FEATURED.glow} 16%, transparent)`, color: FEATURED.glow }}
            >
              <FEATURED.Icon size={38} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5 mb-2">
                <span
                  className="text-[10px] font-mono font-bold px-2 py-1 rounded-md tracking-wider"
                  style={{
                    background: `color-mix(in oklab, ${FEATURED.glow} 16%, transparent)`,
                    color: FEATURED.glow,
                    border: `1px solid color-mix(in oklab, ${FEATURED.glow} 30%, transparent)`,
                  }}
                >
                  MAIN GAME
                </span>
                <span className="label-mono !tracking-[.14em]">{FEATURED.tag}</span>
              </div>
              <h2 className="h-section text-3xl md:text-4xl ink-1 mb-2">{FEATURED.title}</h2>
              <p className="text-sm ink-2 leading-relaxed max-w-2xl">{FEATURED.blurb}</p>
            </div>

            <span
              className="btn btn-primary px-6 py-3 text-sm shrink-0 self-start md:self-center"
              style={{ ['--glow' as string]: FEATURED.glow }}
            >
              Play <ArrowRight size={15} />
            </span>
          </div>
        </button>

        {/* -------- modes -------- */}
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((m, i) => {
            const isCampaign = m.id === 'campaign';
            const tag = isCampaign ? campaignTag : m.tag;
            const campaignComplete = isCampaign && campaignDone.length === 2;
            return (
              <ModeCardButton
                key={m.id}
                mode={m}
                tag={tag}
                index={i}
                showComplete={campaignComplete}
                onOpen={onOpen}
              />
            );
          })}
        </div>

        {/* -------- your operative -------- */}
        <button
          onClick={() => onOpen('customize')}
          style={{ ['--glow' as string]: you.accentColor }}
          className="a-rise card glass mt-4 w-full rounded-[22px] px-5 py-4 flex items-center gap-4 text-left"
        >
          <span
            className="grid place-items-center w-11 h-11 rounded-full shrink-0 border"
            style={{ background: you.skinTone, borderColor: 'rgb(var(--glass-border)/.35)' }}
          >
            <UserRound size={18} style={{ color: 'rgba(0,0,0,.55)' }} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold ink-1 truncate">
              {you.nickname.trim() || 'Unnamed operative'}
            </div>
            <div className="label-mono !text-[9px] truncate mt-0.5">
              {you.build} · {you.hairStyle} · {you.outfit}
            </div>
          </div>
          <span className="text-[11px] ink-4 flex items-center gap-1 shrink-0">
            Edit <ArrowRight size={11} />
          </span>
        </button>
      </div>
    </div>
  );
}
