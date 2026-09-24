import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { SceneManager } from './engine/SceneManager';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  SceneManager.load('home');
});

it('loads a screen on navigation and preserves room parameters across lazy loading', async () => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  const room = { id: 'intro', title: 'Room navigation check', summary: 'Practice', difficulty: 'Easy', estimatedMinutes: 5, completed: false, tasks: [] };
  const fetchMock = vi.fn(async (url: string) => {
    const body = url === '/api/paths/symmetric'
      ? { path: { id: 'symmetric', title: 'Learning path check', description: 'Practice encryption' }, rooms: [room] }
      : url === '/api/badges' ? { badges: [] } : room;
    return { ok: true, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /^Rooms$/ }));
  expect(await screen.findByRole('heading', { name: 'Learning path check' })).toBeTruthy();
  fireEvent.click(screen.getByText(room.title));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/rooms/intro'));
  expect(await screen.findByRole('heading', { name: room.title })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Quantum Lab home' }));
  expect(SceneManager.currentScene).toBe('home');
  expect(screen.queryByRole('heading', { name: room.title })).toBeNull();
});
