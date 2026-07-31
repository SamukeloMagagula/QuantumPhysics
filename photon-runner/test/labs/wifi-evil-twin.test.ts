import { describe, expect, it } from 'vitest';
import { SCAN, evilTwinId, checkPick } from '../../labs/wifi-evil-twin';

describe('evilTwinId', () => {
  it('identifies the OPEN network cloning a secured SSID', () => {
    expect(evilTwinId(SCAN)).toBe('n2');
  });

  it('returns null when no evil twin exists', () => {
    const clean = SCAN.filter((n) => n.id !== 'n2');
    expect(evilTwinId(clean)).toBeNull();
  });
});

describe('checkPick', () => {
  it('accepts the correct id', () => {
    expect(checkPick('n2', SCAN)).toBe(true);
  });

  it('rejects an incorrect id', () => {
    expect(checkPick('n1', SCAN)).toBe(false);
  });
});
