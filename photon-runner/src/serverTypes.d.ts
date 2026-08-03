import type { UserRow } from './serverIdentity';

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

export {};
