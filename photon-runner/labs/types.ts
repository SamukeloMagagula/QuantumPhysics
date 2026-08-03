export type LabDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface LabContext {
  complete(): void;
}

export interface Lab {
  id: string;
  title: string;
  difficulty: LabDifficulty;
  category: string;
  intro(): string;
  render(container: HTMLElement, ctx: LabContext): void;
  explain(): string;
}
