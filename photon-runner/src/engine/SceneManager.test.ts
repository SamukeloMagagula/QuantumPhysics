import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneManager } from './SceneManager';

describe('SceneManager', () => {
  beforeEach(() => SceneManager.reset());

  it('load() runs onLoad with params and updates currentScene', () => {
    const onLoad = vi.fn();
    SceneManager.register<{ mapId: string }>({ id: 'heist', onLoad });

    SceneManager.load('heist', { mapId: 'relay' });

    expect(SceneManager.currentScene).toBe('heist');
    expect(SceneManager.currentSceneParams).toEqual({ mapId: 'relay' });
    expect(onLoad).toHaveBeenCalledWith({ mapId: 'relay' });
  });

  it('navigating away calls the previous scene\'s onUnload before the next onLoad', () => {
    const order: string[] = [];
    SceneManager.register({ id: 'home', onLoad: () => order.push('home:load'), onUnload: () => order.push('home:unload') });
    SceneManager.register({ id: 'labs', onLoad: () => order.push('labs:load') });

    SceneManager.load('home');
    SceneManager.load('labs');

    expect(order).toEqual(['home:load', 'home:unload', 'labs:load']);
  });

  it('warns and no-ops when loading an unregistered scene', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    SceneManager.register({ id: 'home' });
    SceneManager.load('home');

    SceneManager.load('does-not-exist');

    expect(SceneManager.currentScene).toBe('home'); // unchanged
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('subscribers receive every transition', () => {
    SceneManager.register({ id: 'a' });
    SceneManager.register({ id: 'b' });
    const fn = vi.fn();
    SceneManager.subscribe(fn);

    SceneManager.load('a');
    SceneManager.load('b');

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[1][0]).toMatchObject({ id: 'b' });
  });

  it('re-registering an id replaces its definition', () => {
    const first = vi.fn();
    const second = vi.fn();
    SceneManager.register({ id: 'x', onLoad: first });
    SceneManager.register({ id: 'x', onLoad: second });

    SceneManager.load('x');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});
