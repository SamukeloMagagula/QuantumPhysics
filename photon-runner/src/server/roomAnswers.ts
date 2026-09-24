/**
 * Ported 1:1 from quantumbreach/rooms/answers.py. Answers are never stored or
 * transmitted in plaintext — room content stores a SHA-256 hex digest of the
 * normalized answer, and submissions are hashed the same way before compare.
 */
import crypto from 'node:crypto';
import type { AnswerType } from './roomsContent';

export interface NormalizeOpts {
  caseInsensitive?: boolean;
  trim?: boolean;
  numeric?: boolean;
}

export function normalizeAnswer(raw: unknown, opts: NormalizeOpts = {}): string {
  const { caseInsensitive = true, trim = true, numeric = false } = opts;
  let s = String(raw);
  if (trim) s = s.trim();
  if (numeric) {
    // JS's Number->String conversion already collapses whole-number floats to
    // their integer form (String(10) === "10"), matching Python's
    // str(int(f)) if f.is_integer() else str(f) without needing the branch.
    const f = Number(s);
    return s !== '' && !Number.isNaN(f) ? String(f) : s;
  }
  if (caseInsensitive) s = s.toLowerCase();
  return s;
}

export function hashAnswer(raw: unknown, opts: NormalizeOpts = {}): string {
  const norm = normalizeAnswer(raw, opts);
  return crypto.createHash('sha256').update(norm, 'utf8').digest('hex');
}

export interface CheckAnswerArgs {
  submitted: unknown;
  stored: string;
  answerType: AnswerType;
  caseInsensitive: boolean;
  trim: boolean;
}

/** True if `submitted` matches the stored hash (exact/number/flag) or regex pattern. */
export function checkAnswer({ submitted, stored, answerType, caseInsensitive, trim }: CheckAnswerArgs): boolean {
  if (answerType === 'regex') {
    // Regex answers store a plaintext pattern (not a hash). Don't lowercase the
    // submission here; apply case-insensitivity symmetrically to BOTH pattern
    // and submission via the 'i' flag, so an author may write the pattern in
    // any case.
    const norm = normalizeAnswer(submitted, { caseInsensitive: false, trim });
    try {
      const re = new RegExp(`^(?:${stored})$`, caseInsensitive ? 'i' : '');
      return re.test(norm);
    } catch {
      return false;
    }
  }
  const numeric = answerType === 'number';
  return hashAnswer(submitted, { caseInsensitive, trim, numeric }) === stored;
}
