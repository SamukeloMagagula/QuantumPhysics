import { expect, type Browser, type Page } from '@playwright/test';

export const APPEARANCE_KEY = 'photon-runner:characterAppearance';

/** A fresh browser context is a separate guest: its own cookie and storage. */
export async function joinCampus(browser: Browser, nickname: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(
    ([key, name]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ nickname: name }));
    },
    [APPEARANCE_KEY, nickname],
  );
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('world-player')).toBeVisible();
  return page;
}

export async function playerState(page: Page) {
  return page.getByTestId('world-player').evaluate(el => {
    const d = (el as HTMLElement).dataset;
    return { x: Number(d.x), y: Number(d.y), seat: d.seat || undefined };
  });
}

/** Walk with the keyboard until the player stands within `tolerance` of a map point. */
export async function walkNear(page: Page, target: { x: number; y: number }, tolerance = 6) {
  for (let i = 0; i < 60; i++) {
    const p = await playerState(page);
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    if (Math.abs(dx) < tolerance && Math.abs(dy) < tolerance) return;
    const horizontal = Math.abs(dx) >= tolerance;
    const key = horizontal ? (dx > 0 ? 'd' : 'a') : dy > 0 ? 's' : 'w';
    const distance = Math.abs(horizontal ? dx : dy);
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.min(250, Math.max(30, (distance / 160) * 1000)));
    await page.keyboard.up(key);
  }
  throw new Error(`could not reach ${JSON.stringify(target)}; at ${JSON.stringify(await playerState(page))}`);
}
