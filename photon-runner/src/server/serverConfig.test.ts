import { describe, expect, it } from 'vitest';
import { readServerConfig } from './serverConfig';

describe('server configuration', () => {
  it.each([undefined, '', '   ', 'dev-insecure-secret-change-me', 'short-secret'])(
    'rejects unsafe production secret %s', (SECRET_KEY) => {
      expect(() => readServerConfig({ NODE_ENV: 'production', SECRET_KEY })).toThrow('SECRET_KEY');
    },
  );

  it('uses the supplied production secret and secure cookies', () => {
    const secret = 'a-production-test-secret-of-at-least-32-characters';
    expect(readServerConfig({ NODE_ENV: 'production', SECRET_KEY: secret })).toEqual({
      secret, secureCookies: true, enableLegacyHeist: false,
    });
  });

  it('supports local development without exposing the retired API by default', () => {
    expect(readServerConfig({})).toMatchObject({ secureCookies: false, enableLegacyHeist: false });
    expect(readServerConfig({ ENABLE_LEGACY_HEIST: 'true' }).enableLegacyHeist).toBe(true);
  });
});
