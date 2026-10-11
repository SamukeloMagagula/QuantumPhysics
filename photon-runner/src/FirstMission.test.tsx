import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FirstMission } from './FirstMission';
import { readFacilityStory, saveFacilityStory } from './facilityStory';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function win() {
  fireEvent.click(screen.getByRole('button', { name: /Dazzle the detector/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Send a burst' }));
  expect((screen.getByRole('button', { name: /Extract the clue/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Send a burst' }));
  fireEvent.click(screen.getByRole('button', { name: /Extract the clue/ }));
}

it('turns a capture into a visible clue and saved access, then continues', () => {
  const onContinue = vi.fn();
  render(<FirstMission onContinue={onContinue} onExit={vi.fn()} />);
  win();
  expect(screen.getByRole('heading', { name: /Meet at the observatory/ })).toBeTruthy();
  expect(readFacilityStory()).toEqual({ access: true, completed: 1 });
  fireEvent.click(screen.getByRole('button', { name: /Take the next assignment/ }));
  expect(onContinue).toHaveBeenCalledOnce();
});

it('allows retry after detection without granting progress', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  render(<FirstMission onContinue={vi.fn()} onExit={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send a burst' }));
  expect(screen.getByRole('status').textContent).toContain('Spotted');
  expect(readFacilityStory().completed).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: /Try a different tool/ }));
  win();
  expect(readFacilityStory().completed).toBe(1);
});

it('does not erase later progress when replayed', () => {
  saveFacilityStory({ access: true, completed: 3 });
  render(<FirstMission onContinue={vi.fn()} onExit={vi.fn()} />);
  win();
  expect(readFacilityStory().completed).toBe(3);
});
