/**
 * Proximity voice chat + Eve's footstep-hearing for multiplayer Quantum
 * Heist. Peer connections are a full mesh over WebRTC; signaling (offer/
 * answer/ICE) is relayed through heistService.ts's postSignal/pullSignals —
 * no separate WebSocket server, consistent with the rest of this app's
 * HTTP-polling-only multiplayer.
 *
 * Voice gain and footstep audibility are both distance-based, computed
 * client-side from the same polled seat positions quantumHeistNetwork.ts
 * already has — no extra server state.
 */

const SIGNAL_POLL_MS = 700;
const VOICE_RADIUS = 9;
const FOOTSTEP_RADIUS = 7;
const FOOTSTEP_INTERVAL = 0.42; // seconds between blips while a seat is walking, in range, and you're Eve
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'denied' | 'unsupported';

interface SeatInput {
  seatIndex: number;
  x: number;
  z: number;
  walking: boolean;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  gain: GainNode | null;
  makingOffer: boolean;
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

async function api(path: string, body?: unknown): Promise<{ messages?: { from: number; data: unknown }[] }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : {};
}

export interface HeistVoice {
  start(): Promise<void>;
  /** Call every frame with the current human seats (excluding yourself), your
   * own position, and whether you're Eve — updates spatial voice gain and
   * plays footstep blips only Eve can hear. */
  updateSeats(seats: SeatInput[], myX: number, myZ: number, isEve: boolean): void;
  toggleMute(): boolean;
  readonly status: VoiceStatus;
  dispose(): void;
}

export function createHeistVoice(code: string, mySeatIndex: number): HeistVoice {
  let status: VoiceStatus = 'idle';
  let audioCtx: AudioContext | null = null;
  let localStream: MediaStream | null = null;
  let muted = false;
  const peers = new Map<number, PeerEntry>();
  const lastFootstep = new Map<number, number>();
  let pollTimer: number | null = null;
  let disposed = false;

  function ensureAudioCtx(): AudioContext {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  }

  async function signal(toSeatIndex: number, data: unknown): Promise<void> {
    await api(`/api/heist/room/${code}/signal`, { to: toSeatIndex, data }).catch(() => {});
  }

  function ensurePeer(peerSeatIndex: number): PeerEntry {
    let entry = peers.get(peerSeatIndex);
    if (entry) return entry;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    entry = { pc, gain: null, makingOffer: false };
    peers.set(peerSeatIndex, entry);

    if (localStream) {
      for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) void signal(peerSeatIndex, { kind: 'ice', candidate: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      const ctx = ensureAudioCtx();
      const src = ctx.createMediaStreamSource(e.streams[0]);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(ctx.destination);
      entry!.gain = gain;
    };

    pc.onnegotiationneeded = async () => {
      // Lower seat index always initiates — avoids both sides racing an offer (glare).
      if (mySeatIndex >= peerSeatIndex) return;
      try {
        entry!.makingOffer = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await signal(peerSeatIndex, { kind: 'sdp', description: pc.localDescription });
      } finally {
        entry!.makingOffer = false;
      }
    };

    return entry;
  }

  async function handleSignal(from: number, data: unknown): Promise<void> {
    const msg = data as { kind: 'sdp' | 'ice'; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    const entry = ensurePeer(from);
    try {
      if (msg.kind === 'sdp' && msg.description) {
        const isOffer = msg.description.type === 'offer';
        if (isOffer && entry.pc.signalingState !== 'stable') return; // let the polite side's next poll retry
        await entry.pc.setRemoteDescription(msg.description);
        if (isOffer) {
          const answer = await entry.pc.createAnswer();
          await entry.pc.setLocalDescription(answer);
          await signal(from, { kind: 'sdp', description: entry.pc.localDescription });
        }
      } else if (msg.kind === 'ice' && msg.candidate) {
        await entry.pc.addIceCandidate(msg.candidate).catch(() => {});
      }
    } catch {
      // A stale/out-of-order signal — the next poll cycle will resync via renegotiation.
    }
  }

  async function pollLoop(): Promise<void> {
    if (disposed) return;
    try {
      const res = await fetch(`/api/heist/room/${code}/signal`);
      if (res.ok) {
        const { messages } = (await res.json()) as { messages: { from: number; data: unknown }[] };
        for (const m of messages ?? []) await handleSignal(m.from, m.data);
      }
    } catch {
      // transient — next tick retries
    }
  }

  return {
    get status() {
      return status;
    },

    async start() {
      if (typeof RTCPeerConnection === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        status = 'unsupported';
        return;
      }
      status = 'connecting';
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        status = 'live';
      } catch {
        status = 'denied';
        localStream = null;
      }
      pollTimer = window.setInterval(pollLoop, SIGNAL_POLL_MS);
      pollLoop();
    },

    updateSeats(seats, myX, myZ, isEve) {
      for (const seat of seats) {
        const d = dist(myX, myZ, seat.x, seat.z);

        // Spatial voice gain — falls off to silence at VOICE_RADIUS.
        const entry = peers.get(seat.seatIndex);
        if (entry?.gain) {
          const target = muted ? 0 : Math.max(0, 1 - d / VOICE_RADIUS);
          entry.gain.gain.setTargetAtTime(target, ensureAudioCtx().currentTime, 0.08);
        } else if (status === 'live') {
          ensurePeer(seat.seatIndex);
        }

        // Eve-only footstep hearing — synthetic, no asset, throttled per seat.
        if (isEve && seat.walking && d < FOOTSTEP_RADIUS) {
          const now = performance.now() / 1000;
          const last = lastFootstep.get(seat.seatIndex) ?? 0;
          if (now - last >= FOOTSTEP_INTERVAL) {
            lastFootstep.set(seat.seatIndex, now);
            playFootstep(ensureAudioCtx(), Math.max(0, 1 - d / FOOTSTEP_RADIUS));
          }
        }
      }
    },

    toggleMute() {
      muted = !muted;
      if (localStream) for (const t of localStream.getAudioTracks()) t.enabled = !muted;
      return muted;
    },

    dispose() {
      disposed = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      localStream?.getTracks().forEach((t) => t.stop());
      peers.forEach((p) => p.pc.close());
      peers.clear();
      audioCtx?.close().catch(() => {});
      audioCtx = null;
    },
  };
}

function playFootstep(ctx: AudioContext, volume: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 180 + Math.random() * 40;
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume * 0.35, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.16);
}
