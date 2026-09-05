import { el } from './labDom';
import { CARD, MUTED, BUTTON_SECONDARY } from './labStyles';
import { Lab } from './labTypes';

export interface WifiNetwork {
  id: string;
  ssid: string;
  security: 'WPA2' | 'WPA3' | 'OPEN';
  bssid: string;
  signal: number;
}

export const SCAN: WifiNetwork[] = [
  { id: 'n1', ssid: 'CoffeeShop_WiFi', security: 'WPA2', bssid: 'A4:2B:8C:11:57:9D', signal: 4 },
  { id: 'n2', ssid: 'CoffeeShop WiFi', security: 'OPEN', bssid: 'F0:99:1C:34:AA:02', signal: 3 },
  { id: 'n3', ssid: 'HomeNet_5G', security: 'WPA3', bssid: '3C:5A:B4:77:20:E1', signal: 2 },
  { id: 'n4', ssid: 'xfinitywifi', security: 'OPEN', bssid: '12:34:56:78:9A:BC', signal: 1 },
];

const normSsid = (s: string) => s.toLowerCase().replace(/[\s_]+/g, '');

// The evil twin is an OPEN network whose SSID matches a secured (non-OPEN) one.
export function evilTwinId(scan: WifiNetwork[]): string | null {
  const secured = scan.filter((n) => n.security !== 'OPEN');
  for (const n of scan) {
    if (n.security === 'OPEN' && secured.some((s) => s.id !== n.id && normSsid(s.ssid) === normSsid(n.ssid))) {
      return n.id;
    }
  }
  return null;
}

export function checkPick(id: string, scan: WifiNetwork[]): boolean {
  return id === evilTwinId(scan);
}

const lab: Lab = {
  id: 'wifi-evil-twin',
  title: 'WiFi Evil Twin',
  difficulty: 'intermediate',
  category: 'Wireless',
  intro() {
    return `<p>You're on public WiFi. An attacker can set up an <em>evil twin</em> — a rogue
      access point using the same (or a lookalike) network name as a legitimate one, usually
      left <strong>OPEN</strong> so devices connect automatically. Then they sit in the middle
      of all your traffic.</p>
      <p>Here's a scan of nearby networks. Flag the rogue evil twin.</p>`;
  },
  render(container, ctx) {
    const status = el('p', { class: 'text-[var(--ok)]' });
    container.append(
      el('h3', { class: 'text-base font-bold ink-1' }, 'WiFi scan — pick the evil twin'),
      el('p', { class: MUTED }, 'One of these is a rogue AP impersonating a real network. Flag it.')
    );
    for (const n of SCAN) {
      const bars = '▂▄▆█'.slice(0, n.signal) || '▂';
      container.append(
        el(
          'div',
          { class: CARD },
          el('div', {}, el('strong', { class: 'ink-1' }, n.ssid), `  [${n.security}]`),
          el('div', { class: MUTED }, `BSSID ${n.bssid} · signal ${bars}`),
          el(
            'button',
            {
              class: BUTTON_SECONDARY,
              onClick: () => {
                if (checkPick(n.id, SCAN)) {
                  status.textContent = "✅ Correct — that's the evil twin.";
                  ctx.complete();
                } else {
                  status.textContent = '❌ That one looks legit. Find an OPEN network cloning a secured SSID.';
                }
              },
            },
            'Flag as rogue'
          )
        )
      );
    }
    container.append(status);
  },
  explain() {
    return `<p>The rogue was an <strong>OPEN</strong> network cloning the name of a secured
      (WPA2) one — a classic evil twin. Devices set to auto-join open networks by name walk
      straight into it, letting the attacker intercept everything.</p>
      <p><strong>Defense:</strong> prefer WPA2/WPA3 networks, confirm the exact name with
      staff, disable auto-join for open networks, and use a VPN on any untrusted WiFi.</p>`;
  },
};

export default lab;
