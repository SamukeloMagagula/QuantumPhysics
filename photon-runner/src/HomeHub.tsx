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
} from 'lucide-react';
import { getAppearance } from './characterAppearance';
import { getCompletedScenes } from './campaignProgress';
import { Card, Page, PageHeader, Section, Tag } from './ui/Page';

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
}

const FEATURED: ModeCard = {
  id: 'qkd-attack',
  title: 'Phantom Q Headquarters',
  tag: 'Hacking simulation · walk-in HQ',
  blurb:
    'Walk the operations floor and step up to a console. You are Eve on a fibre BB84 link: tap the ' +
    'communications desk, find the countermeasure the target is missing, and build an attack out of what it ' +
    'cannot see. Then read the status wall and work out who was listening.',
  Icon: Eye,
};

/**
 * The hub, grouped by what you are actually there to do.
 *
 * It used to be one flat grid of eight cards under a 96px wordmark, each card
 * a different colour for no reason anyone could state. Grouping is what makes
 * a hub navigable: you arrive knowing whether you want to learn something,
 * practise something, or play with someone else, and the page is organised
 * around that question rather than around the order the modes were built in.
 */
const GROUPS: { title: string; description: string; modes: ModeCard[] }[] = [
  {
    title: 'Learn',
    description: 'Guided material, worked through in order.',
    modes: [
      {
        id: 'campaign',
        title: 'Quantum Breach',
        tag: 'Story campaign · single-player',
        blurb:
          'Symmetric and asymmetric cryptography the hard way — watch a shared key get intercepted, then a public key get spoofed.',
        Icon: Lock,
      },
      {
        id: 'rooms',
        title: 'Symmetric Cryptography',
        tag: 'Four-room learning path',
        blurb: 'Caesar, brute force, frequency analysis, XOR and one-time pads. Points, badges and a leaderboard.',
        Icon: BookOpen,
      },
      {
        id: 'labs',
        title: 'Security Labs',
        tag: 'Ten labs · six section tests',
        blurb:
          'Carry out real scaled-down attacks — injection, phishing, denial of service, RSA — then sit the section test.',
        Icon: FlaskConical,
      },
    ],
  },
  {
    title: 'Explore and practise',
    description: 'Open environments and short rounds.',
    modes: [
      {
        id: 'campus',
        title: 'Research Campus',
        tag: 'Explore · 3D hub',
        blurb: 'Walk the grounds outside the facility and step through a door to open that world.',
        Icon: Building2,
      },
      {
        id: 'quantum',
        title: 'Quantum 3D Lab',
        tag: 'Sandbox',
        blurb: 'An optical bench you can touch — polarisation, superposition, and a live intercept readout.',
        Icon: Sparkles,
      },
      {
        id: 'defender',
        title: 'Network Defender',
        tag: 'Arcade round',
        blurb: 'Hold the perimeter as intrusions escalate. A short reflex round between runs.',
        Icon: Shield,
      },
    ],
  },
  {
    title: 'Multiplayer',
    description: 'Played against other people, over the network.',
    modes: [
      {
        id: 'qkd-multiplayer',
        title: 'Quantum Intercept',
        tag: 'Two to three players',
        blurb: 'A real BB84 key exchange over the network — Alice sends, Bob receives, Eve secretly taps the line.',
        Icon: Radio,
      },
    ],
  },
];

export function HomeHub({ onOpen }: HomeHubProps) {
  const you = getAppearance();
  const campaignDone = getCompletedScenes();
  const campaignTag = !campaignDone.includes('scene1')
    ? 'Story campaign · single-player'
    : !campaignDone.includes('scene2')
    ? 'Continue · scene 2 of 3'
    : 'Completed · replay any time';

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="BB84 quantum cryptography"
        title="Quantum Lab"
        description="Learn how quantum key distribution actually works by playing it — as the sender, the receiver, or the spy that physics gives away."
      />

      <Section title="Main game" description="Start here.">
        <button
          onClick={() => onOpen(FEATURED.id)}
          className="card panel w-full rounded-xl p-5 text-left"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-5">
            <span
              className="grid place-items-center w-12 h-12 rounded-xl shrink-0"
              style={{ background: 'color-mix(in oklab, var(--accent) 14%, transparent)', color: 'var(--accent)' }}
            >
              <FEATURED.Icon size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Tag tone="var(--accent)">Main game</Tag>
                <span className="label-mono !text-[9px]">{FEATURED.tag}</span>
              </div>
              <h2 className="h-section text-lg ink-1">{FEATURED.title}</h2>
              <p className="text-[13px] ink-2 leading-relaxed mt-1.5 max-w-2xl">{FEATURED.blurb}</p>
            </div>
            <span className="btn btn-primary px-4 py-2 text-sm shrink-0 self-start md:self-center">
              Play <ArrowRight size={14} />
            </span>
          </div>
        </button>
      </Section>

      {GROUPS.map((group) => (
        <Section key={group.title} title={group.title} description={group.description}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.modes.map((mode) => {
              const isCampaign = mode.id === 'campaign';
              return (
                <ModeCard
                  key={mode.id}
                  mode={mode}
                  tag={isCampaign ? campaignTag : mode.tag}
                  complete={isCampaign && campaignDone.length === 2}
                  onOpen={onOpen}
                />
              );
            })}
          </div>
        </Section>
      ))}

      <Section title="Your operative" description="Carried into every mode.">
        <button
          onClick={() => onOpen('customize')}
          className="card panel w-full rounded-xl px-4 py-3 flex items-center gap-3 text-left"
        >
          <span
            className="w-9 h-9 rounded-full shrink-0 border"
            style={{ background: you.skinTone, borderColor: 'rgb(var(--glass-border)/.35)' }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold ink-1 truncate">
              {you.nickname?.trim() || 'Unnamed operative'}
            </span>
            <span className="label-mono !text-[9px] block mt-0.5">
              {you.build} · {you.hairStyle} · {you.outfit}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] ink-3 shrink-0">
            <Palette size={12} /> Edit
          </span>
        </button>
      </Section>
    </Page>
  );
}

function ModeCard({
  mode,
  tag,
  complete,
  onOpen,
}: {
  mode: ModeCard;
  tag: string;
  complete: boolean;
  onOpen: (id: ModeId) => void;
}) {
  return (
    <Card as="button" onClick={() => onOpen(mode.id)}>
      <div className="flex items-start justify-between gap-3">
        <span
          className="grid place-items-center w-9 h-9 rounded-lg shrink-0"
          style={{ background: 'color-mix(in oklab, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
        >
          <mode.Icon size={17} />
        </span>
        {complete && (
          <span style={{ color: 'var(--ok)' }}>
            <Check size={14} />
          </span>
        )}
      </div>

      <h3 className="text-[14px] font-semibold ink-1 mt-3">{mode.title}</h3>
      <div className="label-mono !text-[9px] mt-1">{tag}</div>
      <p className="text-[12px] ink-3 leading-relaxed mt-2 flex-1">{mode.blurb}</p>

      <span className="text-[11px] ink-4 flex items-center gap-1 mt-3">
        Open <ArrowRight size={11} />
      </span>
    </Card>
  );
}
