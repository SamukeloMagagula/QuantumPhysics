import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeyboardMovementInput } from './keyboardMovement';

function keyEvent(type: 'keydown' | 'keyup', key: string): KeyboardEvent {
  return new KeyboardEvent(type, { key });
}

describe('createKeyboardMovementInput sprint', () => {
  it('leaves text entry and button activation to the focused control', () => {
    const scheme = createKeyboardMovementInput();
    const onMove = vi.fn(), onInteract = vi.fn();
    scheme.attach(document.body, { onMove, onInteract });
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onMove).not.toHaveBeenCalled();
    expect(onInteract).not.toHaveBeenCalled();
    input.remove();
    scheme.detach();
  });

  it('interacts once per press and stops movement when focus enters a control', () => {
    const scheme = createKeyboardMovementInput();
    const onMove = vi.fn(), onInteract = vi.fn();
    scheme.attach(document.body, { onMove, onInteract });
    window.dispatchEvent(keyEvent('keydown', 'e'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', repeat: true }));
    expect(onInteract).toHaveBeenCalledTimes(1);
    window.dispatchEvent(keyEvent('keydown', 'w'));
    window.dispatchEvent(new FocusEvent('focusin'));
    expect(onMove).toHaveBeenLastCalledWith(0, 0, false);
    scheme.detach();
  });
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
