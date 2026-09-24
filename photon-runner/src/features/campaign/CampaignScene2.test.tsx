import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignScene2 } from './CampaignScene2';

afterEach(() => cleanup());

describe('CampaignScene2', () => {
  it('renders the intro and lets the player exit', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(<CampaignScene2 onNext={vi.fn()} onExit={onExit} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Asymmetric Cryptography' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'You Can Share the Lock.' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /exit/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('reveals a beat\'s result before advancing — the action button must not both compute and advance in one click', async () => {
    const user = userEvent.setup();
    render(<CampaignScene2 onNext={vi.fn()} onExit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Continue' })); // intro -> bob-generates
    await user.click(screen.getByRole('button', { name: /generate keypair/i }));

    // The generated keypair and the step's own Continue button must both be
    // on screen together — the panel must not have already swapped away.
    expect(screen.getByText(/Public key \(n, e\)/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('walks the full happy path — clean encryption, then the MITM twist — and fires onNext', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<CampaignScene2 onNext={onNext} onExit={vi.fn()} />);

    const cont = () => user.click(screen.getByRole('button', { name: 'Continue' }));

    await cont(); // intro

    await user.click(screen.getByRole('button', { name: /generate keypair/i }));
    await cont();

    await user.click(screen.getByRole('button', { name: /encrypt with bob's public key/i }));
    await cont();

    await user.click(screen.getByRole('button', { name: /try to decrypt/i }));
    expect(screen.getByText(/Decryption failed/i)).toBeTruthy();
    await cont();

    await cont(); // explain-asymmetric

    await user.click(screen.getByRole('button', { name: /forge a keypair/i }));
    await cont();

    await user.click(screen.getByRole('button', { name: /encrypt & send/i }));
    await cont();

    await user.click(screen.getByRole('button', { name: /decrypt with her real private key/i }));
    expect(screen.getByText(/^Eve reads it:/i)).toBeTruthy();
    await cont();

    await user.click(screen.getByRole('button', { name: /re-encrypt with bob's real key/i }));
    await cont();

    await user.click(screen.getByRole('button', { name: /decrypt with his private key/i }));
    expect(screen.getByText(/Recovered:/i)).toBeTruthy();
    await cont();

    await screen.findByText(/MAN-IN-THE-MIDDLE/i);
    await cont(); // reveal
    await cont(); // transition

    const finishBtn = await screen.findByRole('button', { name: /continue to quantum breach/i });
    await user.click(finishBtn);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
