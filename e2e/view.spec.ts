import { expect, test, type Page } from '@playwright/test';

const stage = (page: Page) => page.getByRole('application');
const zoomReadout = (page: Page) => page.getByRole('button', { name: /^\d+%$/ });
const NOTCH = Math.exp(0.4);

async function zoomIn(page: Page, x: number, y: number, notches = 1) {
	await page.mouse.move(x, y);
	await page.keyboard.down('Control');
	for (let i = 0; i < notches; i++) await page.mouse.wheel(0, -100);
	await page.keyboard.up('Control');
	await expect(zoomReadout(page)).not.toHaveText('100%');
}

async function savedElements(page: Page) {
	const toggle = page.getByRole('button', { name: 'Code', exact: true });
	if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
	const text = await page.getByTestId('code').textContent();
	const json = /const garden = (\{[\s\S]*?\n\s*\});/.exec(text ?? '')![1];
	return JSON.parse(json).elements as { x: number; y: number; scale: number; path?: number[] }[];
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(stage(page).locator('canvas')).toBeVisible();
});

test('a seed dropped on a zoomed view is saved in world coordinates', async ({ page }) => {
	const s = (await stage(page).boundingBox())!;
	const anchor = { x: s.x + s.width * 0.4, y: s.y + s.height * 0.4 };
	const drop = { x: s.x + s.width * 0.6, y: s.y + s.height * 0.55 };
	await zoomIn(page, anchor.x, anchor.y);
	await expect(zoomReadout(page)).toHaveText('149%');

	const seed = (await page.getByRole('button', { name: 'Bloom', exact: true }).boundingBox())!;
	await page.mouse.move(seed.x + seed.width / 2, seed.y + seed.height / 2);
	await page.mouse.down();
	await page.mouse.move(drop.x, drop.y, { steps: 8 });
	await page.mouse.up();

	const sel = (await page.getByTestId('selection').boundingBox())!;
	expect(sel.x + sel.width / 2).toBeCloseTo(drop.x, 0);
	expect(sel.y + sel.height / 2).toBeCloseTo(drop.y, 0);

	const [bloom] = await savedElements(page);
	expect(bloom.x).toBeCloseTo((anchor.x + (drop.x - anchor.x) / NOTCH - s.x) / s.width, 2);
	expect(bloom.y).toBeCloseTo((anchor.y + (drop.y - anchor.y) / NOTCH - s.y) / s.height, 2);
});

test('the zoom readout and the 0 key return to 100%', async ({ page }) => {
	const s = (await stage(page).boundingBox())!;
	await zoomIn(page, s.x + 300, s.y + 200, 2);
	await zoomReadout(page).click();
	await expect(zoomReadout(page)).toHaveText('100%');

	await zoomIn(page, s.x + 300, s.y + 200);
	await stage(page).focus();
	await page.keyboard.press('0');
	await expect(zoomReadout(page)).toHaveText('100%');
});

test('plain wheel pans and space-drag pans without changing plants', async ({ page }) => {
	const s = (await stage(page).boundingBox())!;
	await page.getByRole('button', { name: 'Bloom', exact: true }).click();
	const before = (await page.getByTestId('selection').boundingBox())!;

	await page.mouse.move(s.x + 700, s.y + 300);
	await page.mouse.wheel(0, 80);
	await expect
		.poll(async () => (await page.getByTestId('selection').boundingBox())!.y)
		.toBeCloseTo(before.y - 80, 0);

	await page.keyboard.down('Space');
	await page.mouse.down();
	await page.mouse.move(s.x + 760, s.y + 340, { steps: 4 });
	await page.mouse.up();
	await page.keyboard.up('Space');
	const after = (await page.getByTestId('selection').boundingBox())!;
	expect(after.x - before.x).toBeCloseTo(60, 0);
	expect(after.y - before.y).toBeCloseTo(-40, 0);

	const [bloom] = await savedElements(page);
	expect(bloom).toMatchObject({ x: 0.5, y: 0.5 });
});

test('painting while zoomed stores a world-space path', async ({ page }) => {
	const s = (await stage(page).boundingBox())!;
	const anchor = { x: s.x + s.width * 0.5, y: s.y + s.height * 0.5 };
	await zoomIn(page, anchor.x, anchor.y);
	await page.getByRole('button', { name: 'Paint', exact: true }).click();

	const y = anchor.y + 60;
	const [x0, x1] = [anchor.x - 150, anchor.x + 250];
	await page.mouse.move(x0, y);
	await page.mouse.down();
	for (let i = 1; i <= 16; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 16, y);
	await page.mouse.up();

	const [stroke] = await savedElements(page);
	const mid = anchor.x + ((x0 + x1) / 2 - anchor.x) / NOTCH;
	expect(stroke.x).toBeCloseTo((mid - s.x) / s.width, 2);
	expect(stroke.y).toBeCloseTo((anchor.y + (y - anchor.y) / NOTCH - s.y) / s.height, 2);
	const unit = 0.12 * Math.min(s.width, s.height);
	expect(stroke.scale).toBeCloseTo((x1 - x0) / 2 / NOTCH / unit, 1);
	expect(stroke.path!.length).toBeGreaterThan(6);
});
