import { beforeEach, describe, expect, it } from 'vitest';
import { createGuestStore } from '../../labs/framework';

beforeEach(() => {
  localStorage.clear();
});

describe('createGuestStore', () => {
  it('starts with nothing complete', () => {
    const store = createGuestStore();
    expect(store.all()).toEqual([]);
    expect(store.isComplete('caesar-cipher')).toBe(false);
  });

  it('marks a lab complete and persists it', () => {
    const store = createGuestStore();
    store.markComplete('caesar-cipher');
    expect(store.isComplete('caesar-cipher')).toBe(true);
    expect(createGuestStore().all()).toEqual(['caesar-cipher']);
  });

  it('does not duplicate an already-completed lab', () => {
    const store = createGuestStore();
    store.markComplete('xss');
    store.markComplete('xss');
    expect(store.all()).toEqual(['xss']);
  });
});
