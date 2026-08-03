import type { UserRow } from './identity';

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

export {};
