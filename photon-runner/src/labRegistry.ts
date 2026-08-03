import sqlInjection from './sql-injection';
import xss from './xss';
import phishingSpotter from './phishing-spotter';
import passwordCracking from './password-cracking';
import wifiEvilTwin from './wifi-evil-twin';
import caesarCipher from './caesar-cipher';
import rsaFactoring from './rsa-factoring';
import bb84Qkd from './bb84-qkd';
import { Lab } from './labTypes';

export const LABS: Lab[] = [
  sqlInjection,
  xss,
  phishingSpotter,
  passwordCracking,
  wifiEvilTwin,
  caesarCipher,
  rsaFactoring,
  bb84Qkd,
];

export const CATEGORY_ORDER = ['Web Attacks', 'Social Engineering & Passwords', 'Wireless', 'Cryptography'];

export function getLab(id: string): Lab | undefined {
  return LABS.find((l) => l.id === id);
}
