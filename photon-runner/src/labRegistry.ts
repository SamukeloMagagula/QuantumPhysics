import whyEncryption from './why-encryption';
import sqlInjection from './sql-injection';
import xss from './xss';
import phishingSpotter from './phishing-spotter';
import passwordCracking from './password-cracking';
import wifiEvilTwin from './wifi-evil-twin';
import ddosDefense from './ddos-defense';
import caesarCipher from './caesar-cipher';
import rsaFactoring from './rsa-factoring';
import bb84Qkd from './bb84-qkd';
import { Lab } from './labTypes';

export const LABS: Lab[] = [
  whyEncryption,
  sqlInjection,
  xss,
  phishingSpotter,
  passwordCracking,
  wifiEvilTwin,
  ddosDefense,
  caesarCipher,
  rsaFactoring,
  bb84Qkd,
];

/**
 * Sections, in the order they should be worked through. Foundations comes
 * first because everything after it assumes you know what encryption is for,
 * and Cryptography comes last because BB84 only makes sense once the key
 * distribution problem has bitten you.
 */
export const CATEGORY_ORDER = [
  'Foundations',
  'Web Attacks',
  'Social Engineering & Passwords',
  'Wireless',
  'Network & Availability',
  'Cryptography',
];

export function getLab(id: string): Lab | undefined {
  return LABS.find((l) => l.id === id);
}

/** The lab ids in a section, in the order they are listed. */
export function labsInSection(section: string): string[] {
  return LABS.filter((l) => l.category === section).map((l) => l.id);
}

/** Sections that actually have labs, in the intended order. */
export function sections(): string[] {
  return [...new Set(LABS.map((l) => l.category))].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
  );
}
