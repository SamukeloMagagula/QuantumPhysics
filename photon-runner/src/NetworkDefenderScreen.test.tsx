import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NetworkDefenderScreen } from './NetworkDefenderScreen';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('waits for the player to start and offers a fresh round without leaving the mode', () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
  render(<NetworkDefenderScreen />);
  expect(screen.getByRole('button', { name: 'Start defence' })).toBeTruthy();
  expect(screen.queryByText('Unblocked malicious')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Start defence' }));
  expect(screen.getByRole('button', { name: 'Pause traffic' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Restart round' }));
  expect(screen.getByRole('button', { name: 'Start defence' })).toBeTruthy();
  expect(cancelAnimationFrame).toHaveBeenCalled();
});
