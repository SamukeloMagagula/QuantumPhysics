import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignScene1 } from './CampaignScene1';

afterEach(() => cleanup());

describe('CampaignScene1', () => {
  it('renders the intro and lets the player exit', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(<CampaignScene1 onNext={vi.fn()} onExit={onExit} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Symmetric Cryptography' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'One Secret. Two People.' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /exit/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('reveals a beat\'s result before advancing — the action button must not both compute and advance in one click', async () => {
    const user = userEvent.setup();
    render(<CampaignScene1 onNext={vi.fn()} onExit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /continue/i })); // intro -> alice-encrypts
    await user.click(screen.getByRole('button', { name: /^encrypt/i }));

    // The ciphertext and the step's own Continue button must both be on
    // screen together — the panel must not have already swapped away.
    expect(screen.getByText(/ciphertext:/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /continue/i })).toBeTruthy();
  });

  it('walks the full happy path to completion and fires onNext', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<CampaignScene1 onNext={onNext} onExit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /continue/i })); // intro

    await user.click(screen.getByRole('button', { name: /^encrypt/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await user.click(screen.getByRole('button', { name: /^decrypt/i }));
    expect(screen.getByText(/recovered:/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await user.click(screen.getByRole('button', { name: /continue/i })); // explain-symmetric

    await user.click(screen.getByRole('button', { name: /watch the intercept/i }));
    await screen.findByText(/THE KEY HAS BEEN COMPROMISED\./i, undefined, { timeout: 2000 });
    await user.click(screen.getByRole('button', { name: /continue/i }));

    const finishBtn = await screen.findByRole('button', { name: /continue to scene 2/i });
    await user.click(finishBtn);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
