import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeyboardMovementInput } from '../../engine/inputSchemes/keyboardMovement';

function keyEvent(type: 'keydown' | 'keyup', key: string): KeyboardEvent {
  return new KeyboardEvent(type, { key });
}

describe('createKeyboardMovementInput sprint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports sprint=false while walking without Shift', () => {
    const scheme = createKeyboardMovementInput();
    const onMove = vi.fn();
    const el = document.createElement('div');
    scheme.attach(el, { onMove, onInteract: vi.fn() });

    window.dispatchEvent(keyEvent('keydown', 'w'));
    expect(onMove).toHaveBeenLastCalledWith(0, 1, false);

    scheme.detach();
  });

  it('reports sprint=true once Shift is held alongside a movement key', () => {
    const scheme = createKeyboardMovementInput();
    const onMove = vi.fn();
    const el = document.createElement('div');
    scheme.attach(el, { onMove, onInteract: vi.fn() });

    window.dispatchEvent(keyEvent('keydown', 'w'));
    window.dispatchEvent(keyEvent('keydown', 'Shift'));
    expect(onMove).toHaveBeenLastCalledWith(0, 1, true);

    window.dispatchEvent(keyEvent('keyup', 'Shift'));
    expect(onMove).toHaveBeenLastCalledWith(0, 1, false);

    scheme.detach();
  });

  it('clears sprint on blur along with movement', () => {
    const scheme = createKeyboardMovementInput();
    const onMove = vi.fn();
    const el = document.createElement('div');
    scheme.attach(el, { onMove, onInteract: vi.fn() });

    window.dispatchEvent(keyEvent('keydown', 'w'));
    window.dispatchEvent(keyEvent('keydown', 'Shift'));
    window.dispatchEvent(new Event('blur'));
    expect(onMove).toHaveBeenLastCalledWith(0, 0, false);

    scheme.detach();
  });
});
