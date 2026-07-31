import { InputScheme, MovementCallbacks } from './types';

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const INTERACT_KEYS = new Set(['e', 'enter', ' ']);

/** Laptop control scheme: WASD/arrow keys for movement, E/Enter/Space to interact. */
export function createKeyboardMovementInput(): InputScheme {
  let callbacks: MovementCallbacks | null = null;
  const held = new Set<string>();

  const computeAndEmit = () => {
    if (!callbacks) return;
    let x = 0;
    let z = 0;
    if (held.has('a') || held.has('arrowleft')) x -= 1;
    if (held.has('d') || held.has('arrowright')) x += 1;
    if (held.has('w') || held.has('arrowup')) z += 1;
    if (held.has('s') || held.has('arrowdown')) z -= 1;
    callbacks.onMove(x, z);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (INTERACT_KEYS.has(key)) {
      e.preventDefault();
      callbacks?.onInteract();
      return;
    }
    if (!MOVE_KEYS.has(key)) return;
    e.preventDefault();
    if (!held.has(key)) {
      held.add(key);
      computeAndEmit();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (held.delete(key)) computeAndEmit();
  };

  const handleBlur = () => {
    held.clear();
    computeAndEmit();
  };

  return {
    id: 'keyboard-movement',
    attach(_el, cbs) {
      callbacks = cbs;
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', handleBlur);
    },
    detach() {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      held.clear();
      callbacks = null;
    },
  };
}
