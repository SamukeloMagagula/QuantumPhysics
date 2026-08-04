import { describe, expect, it } from 'vitest';
import { SAMPLES, scoreAnswers, PASS_THRESHOLD } from './phishing-spotter';

describe('scoreAnswers', () => {
  it('scores all-correct answers as total/total', () => {
    const answers: Record<string, boolean> = {};
    for (const s of SAMPLES) answers[s.id] = s.phishing;
    const { correct, total } = scoreAnswers(answers);
    expect(correct).toBe(total);
    expect(total).toBe(SAMPLES.length);
  });

  it('scores empty answers as 0', () => {
    expect(scoreAnswers({}).correct).toBe(0);
  });

  it('PASS_THRESHOLD is achievable within total samples', () => {
    expect(PASS_THRESHOLD).toBeLessThanOrEqual(SAMPLES.length);
  });
});
