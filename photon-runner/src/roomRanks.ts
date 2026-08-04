// Ported from quantumbreach/progress/ranks.py — thresholds sorted ascending,
// highest threshold <= points wins.
const RANKS: [number, string][] = [
  [0, 'Script Kiddie'],
  [50, 'Codebreaker'],
  [120, 'Keymaster'],
  [220, 'Cipherpunk'],
  [350, 'Quantum Operative'],
];

export function rankForPoints(points: number): string {
  let title = RANKS[0][1];
  for (const [threshold, name] of RANKS) {
    if (points >= threshold) title = name;
  }
  return title;
}
