import { expect, test, type Page } from '@playwright/test';

const stage = (page: Page) => page.getByRole('application');
const selection = (page: Page) => page.getByTestId('selection');

async function box(page: Page, testId: string) {
	const b = await page.getByTestId(testId).boundingBox();
	if (!b) throw new Error(`${testId} is not visible`);
	return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

async function dragSeed(page: Page, label: string, x: number, y: number) {
	const seed = await page.getByRole('button', { name: label }).boundingBox();
	await page.mouse.move(seed!.x + seed!.width / 2, seed!.y + seed!.height / 2);
	await page.mouse.down();
	await page.mouse.move(x - 40, y - 20, { steps: 5 });
	await page.mouse.move(x, y, { steps: 5 });
	await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(stage(page).locator('canvas')).toBeVisible();
});

test('dropping a seed plants it where it was dropped', async ({ page }) => {
	const s = (await stage(page).boundingBox())!;
	await dragSeed(page, 'Bloom', s.x + s.width * 0.3, s.y + s.height * 0.4);
	const sel = await box(page, 'selection');
	expect(sel.cx).toBeCloseTo(s.x + s.width * 0.3, 0);
	expect(sel.cy).toBeCloseTo(s.y + s.height * 0.4, 0);
	await expect(stage(page).locator('canvas [aria-label="Canvas Description"]')).toHaveText(
		'A garden on a dark night with 1 bloom, slowly moving.'
	);
});

test('a dropped element can be moved, grown and turned', async ({ page }) => {
	const s = (await stage(page).boundingBox())!;
	await dragSeed(page, 'Swarm', s.x + s.width * 0.5, s.y + s.height * 0.5);
	const before = await box(page, 'selection');

	await page.mouse.move(before.cx, before.cy);
	await page.mouse.down();
	await page.mouse.move(before.cx + 120, before.cy + 60, { steps: 6 });
	await page.mouse.up();
	const moved = await box(page, 'selection');
	expect(moved.cx - before.cx).toBeCloseTo(120, 0);
	expect(moved.cy - before.cy).toBeCloseTo(60, 0);

	const handle = await box(page, 'scale-handle');
	await page.mouse.move(handle.cx, handle.cy);
	await page.mouse.down();
	await page.mouse.move(handle.cx + 80, handle.cy, { steps: 6 });
	await page.mouse.up();
	expect((await box(page, 'selection')).width).toBeGreaterThan(moved.width * 1.3);

	const rotate = await box(page, 'rotate-handle');
	const centre = await box(page, 'selection');
	await page.mouse.move(rotate.cx, rotate.cy);
	await page.mouse.down();
	await page.mouse.move(centre.cx + 150, centre.cy, { steps: 8 });
	await page.mouse.up();
	await expect(selection(page)).toHaveAttribute('style', /rotate\(1\.5\d*rad\)/);
});

test('clicking a seed plants it in the centre, and Delete removes it', async ({ page }) => {
	await page.getByRole('button', { name: 'Ribbon' }).click();
	const s = (await stage(page).boundingBox())!;
	const sel = await box(page, 'selection');
	expect(sel.cx).toBeCloseTo(s.x + s.width / 2, 0);
	await expect(stage(page)).toBeFocused();
	await page.keyboard.press('Delete');
	await expect(selection(page)).toHaveCount(0);
});

test('clicking empty soil deselects', async ({ page }) => {
	await page.getByRole('button', { name: 'Bloom' }).click();
	const s = (await stage(page).boundingBox())!;
	await page.mouse.click(s.x + 20, s.y + 20);
	await expect(selection(page)).toHaveCount(0);
});

test('every seed in the palette has a rendered icon and can be planted', async ({ page }) => {
	const labels = ['Bloom', 'Swarm', 'Ribbon', 'Tree', 'Fireflies', 'Flow'];
	for (const label of labels) {
		const icon = page.getByRole('button', { name: label, exact: true }).locator('img');
		await expect(icon).toHaveJSProperty('complete', true);
		expect(await icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
	}
	await page.getByRole('button', { name: 'Tree', exact: true }).click();
	await page.getByRole('button', { name: 'Fireflies', exact: true }).click();
	await page.getByRole('button', { name: 'Flow', exact: true }).click();
	await expect(stage(page).locator('canvas [aria-label="Canvas Description"]')).toHaveText(
		'A garden on a dark night with 1 tree, 1 firefly cloud, 1 flow, slowly moving.'
	);
});
