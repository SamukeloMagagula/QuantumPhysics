const DEVELOPMENT_SECRET = 'dev-insecure-secret-change-me';

/** Validate configuration before opening the database or listening for traffic. */
export function readServerConfig(env: NodeJS.ProcessEnv) {
  const production = env.NODE_ENV === 'production';
  const secret = env.SECRET_KEY?.trim();
  if (production && (!secret || secret === DEVELOPMENT_SECRET || secret.length < 32)) {
    throw new Error('Production requires SECRET_KEY with at least 32 characters; use a randomly generated secret.');
  }
  return {
    secret: secret || DEVELOPMENT_SECRET,
    secureCookies: production,
    enableLegacyHeist: env.ENABLE_LEGACY_HEIST === 'true',
  };
}
