import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomRunner } from './RoomRunner';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(['offline', 'limited', 'server'])('does not mark an answer wrong when checking fails: %s', async (failure) => {
  const room = { id: 'test', title: 'Test room', tasks: [{ id: 'task', bodyMarkdown: 'Try a cipher', questions: [{ id: 'answer', prompt: 'Decode it', points: 10, hint: '', answered: false }] }] };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => room }).mockImplementationOnce(async () => {
    if (failure === 'offline') throw new Error('Offline');
    return { ok: false, status: failure === 'limited' ? 429 : 500 };
  }));
  render(<RoomRunner roomId="test" onExit={vi.fn()} />);
  const input = await screen.findByPlaceholderText('Your answer…');
  fireEvent.change(input, { target: { value: 'HELLO' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText(/Not quite/)).toBeNull();
  expect((input as HTMLInputElement).value).toBe('HELLO');
});
