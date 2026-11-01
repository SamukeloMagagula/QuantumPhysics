import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CustomizeScreen } from './CustomizeScreen';
import { DEFAULT_APPEARANCE, getAppearance, saveAppearance } from './characterAppearance';

afterEach(() => { cleanup(); localStorage.clear(); });
it('previews changes immediately and saves appearance for the map', () => {
  const done = vi.fn();
  render(<CustomizeScreen onDone={done} />);
  fireEvent.change(screen.getByLabelText('Callsign'), { target: { value: 'Nova' } });
  fireEvent.click(screen.getByRole('button', { name: /^Hair$/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Afro' }));
  expect(screen.getByRole('img', { name: 'Nova preview' })).toBeTruthy();
  expect(getAppearance().nickname).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Save appearance' }));
  expect(getAppearance()).toMatchObject({ nickname: 'Nova', hairStyle: 'afro' });
  expect(done).toHaveBeenCalledOnce();
});
it('cancel leaves the saved character unchanged', () => {
  saveAppearance({ ...DEFAULT_APPEARANCE, nickname: 'Original' });
  const cancel = vi.fn();
  render(<CustomizeScreen onDone={vi.fn()} onBack={cancel} />);
  fireEvent.change(screen.getByLabelText('Callsign'), { target: { value: 'Draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Randomize' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(getAppearance()).toEqual({ ...DEFAULT_APPEARANCE, nickname: 'Original' });
  expect(cancel).toHaveBeenCalledOnce();
});
