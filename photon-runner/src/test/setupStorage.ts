/**
 * Node 25 ships its own `localStorage` global, gated behind
 * `--localstorage-file`. Under vitest's jsdom environment that getter takes
 * precedence over jsdom's own, and with no file configured it resolves to
 * `undefined` — so every test that touches storage dies with
 * "localStorage.clear is not a function", regardless of what the test is
 * actually about.
 *
 * Rather than pinning the toolchain to an older Node, install a small
 * spec-shaped Storage in its place. It is a real class with real prototype
 * methods, so the tests that simulate a storage failure by spying on
 * `Storage.prototype.getItem` / `setItem` keep working unchanged.
 */

class MemoryStorage {
  #map = new Map<string, string>();

  get length() {
    return this.#map.size;
  }

  key(i: number): string | null {
    return [...this.#map.keys()][i] ?? null;
  }

  getItem(k: string): string | null {
    return this.#map.has(String(k)) ? this.#map.get(String(k))! : null;
  }

  setItem(k: string, v: string): void {
    this.#map.set(String(k), String(v));
  }

  removeItem(k: string): void {
    this.#map.delete(String(k));
  }

  clear(): void {
    this.#map.clear();
  }
}

function usable(name: 'localStorage' | 'sessionStorage'): boolean {
  try {
    const s = (globalThis as unknown as Record<string, unknown>)[name] as Storage | undefined;
    return !!s && typeof s.clear === 'function' && typeof s.getItem === 'function';
  } catch {
    return false;
  }
}

if (!usable('localStorage') || !usable('sessionStorage')) {
  Object.defineProperty(globalThis, 'Storage', { value: MemoryStorage, configurable: true, writable: true });
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}
