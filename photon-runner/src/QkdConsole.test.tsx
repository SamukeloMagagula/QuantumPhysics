import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QkdConsole } from './QkdConsole';

afterEach(cleanup);

it('plays an intercept using visible controls and supports retry', () => {
  render(<QkdConsole />);
  fireEvent.change(screen.getByLabelText('01 / Choose your target'), { target: { value: 'testbed' } });
  fireEvent.click(screen.getByRole('button', { name: '02 / Scan countermeasures' }));
  fireEvent.click(screen.getByRole('button', { name: /^Dazzle the detector/ }));
  expect(screen.getByRole('button', { name: /^Armed · Dazzle the detector/ }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Run 500 pulses' }));
  expect((screen.getByRole('button', { name: 'Extract key' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Run 500 pulses' }));
  expect(screen.getByRole('status').textContent).toContain('Key goal reached');
  fireEvent.click(screen.getByRole('button', { name: 'Extract key' }));
  expect((screen.getByRole('button', { name: 'Run 500 pulses' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry this target' }));
  expect(screen.getByRole('status').textContent).toContain('Scan the defences');
});

it('offers attack strength without requiring typed commands', () => {
  render(<QkdConsole initialTargetId="blacksite" />);
  fireEvent.click(screen.getByRole('button', { name: /^Dazzle the detector/ }));
  fireEvent.change(screen.getByRole('slider', { name: /Dazzle the detector strength/ }), { target: { value: '45' } });
  expect(screen.getByRole('slider').getAttribute('value')).toBe('45');
  expect(screen.getByText(/Alarm after 500 more pulses/).textContent).toContain('50%');
});
