import { expect, test } from '@playwright/test';
import { WORLD_COMPUTERS } from '../src/worldComputers';
import { APPEARANCE_KEY, joinCampus, playerState, walkNear } from './helpers';

test('two players see each other and quick chat', async ({ browser }) => {
  const nova = await joinCampus(browser, 'Nova');
  const kai = await joinCampus(browser, 'Kai');

  await expect(kai.locator('.world-remote', { hasText: 'Nova' })).toHaveCount(1);
  await expect(nova.locator('.world-remote', { hasText: 'Kai' })).toHaveCount(1);
  await expect(nova.locator('.world-online')).toContainText('2');

  await nova.locator('.world-online').click();
  await nova.locator('.world-people button', { hasText: 'Hi everyone!' }).click();
  await expect(kai.locator('.world-bubble', { hasText: 'Hi everyone!' })).toBeVisible();
});

test('a player sits at a desk computer, opens a program and stands up', async ({ browser }) => {
  const page = await joinCampus(browser, 'Ada');
  const desk = WORLD_COMPUTERS[0];

  await walkNear(page, desk.stand);
  await expect(page.locator('.world-sit-prompt')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.locator('.world-computer')).toBeVisible();
  expect((await playerState(page)).seat).toBe(desk.id);

  await page.locator('.computer-app').first().click();
  await expect(page.locator('.activity-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.world-computer')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.world-computer')).toHaveCount(0);
  expect((await playerState(page)).seat).toBeUndefined();
});

test('the mute choice is remembered', async ({ browser }) => {
  const page = await joinCampus(browser, 'Lin');
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
});

test('a save code carries progress to another browser', async ({ browser }) => {
  const home = await joinCampus(browser, 'Nova');
  // Progress is pushed every few seconds; wait until the server has the look.
  await expect
    .poll(async () => (await (await home.request.get('/api/progress')).json()).progress?.appearance?.nickname, { timeout: 15_000 })
    .toBe('Nova');
  await home.getByRole('button', { name: 'Save progress' }).click();
  const code = home.locator('.world-save-code');
  await expect(code).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const school = await joinCampus(browser, 'Guest');
  await school.getByRole('button', { name: 'Save progress' }).click();
  await school.getByLabel('Save code').fill((await code.textContent()) ?? '');
  // A successful load reloads the page with the restored progress.
  await Promise.all([school.waitForEvent('load'), school.getByRole('button', { name: 'Load' }).click()]);
  await expect(school.getByTestId('world-player')).toBeVisible();
  await expect
    .poll(() => school.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').nickname, APPEARANCE_KEY))
    .toBe('Nova');
});
