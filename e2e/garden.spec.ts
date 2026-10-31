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

test('the handle pill moves, grows and turns the plant', async ({ page }) => {
	const s = (await stage(page).boundingBox())!;
	await dragSeed(page, 'Swarm', s.x + s.width * 0.4, s.y + s.height * 0.35);
	const before = await box(page, 'selection');

	const move = await box(page, 'move-handle');
	await page.mouse.move(move.cx, move.cy);
	await page.mouse.down();
	await page.mouse.move(move.cx + 120, move.cy + 60, { steps: 6 });
	await page.mouse.up();
	const moved = await box(page, 'selection');
	expect(moved.cx - before.cx).toBeCloseTo(120, 0);
	expect(moved.cy - before.cy).toBeCloseTo(60, 0);

	const grow = await box(page, 'scale-handle');
	const dx = grow.cx - moved.cx;
	const dy = grow.cy - moved.cy;
	await page.mouse.move(grow.cx, grow.cy);
	await page.mouse.down();
	await page.mouse.move(moved.cx + dx * 1.6, moved.cy + dy * 1.6, { steps: 6 });
	await page.mouse.up();
	expect((await box(page, 'selection')).width).toBeCloseTo(moved.width * 1.6, -1);

	const turn = await box(page, 'rotate-handle');
	const centre = await box(page, 'selection');
	const radius = Math.hypot(turn.cx - centre.cx, turn.cy - centre.cy);
	const start = Math.atan2(turn.cy - centre.cy, turn.cx - centre.cx);
	await page.mouse.move(turn.cx, turn.cy);
	await page.mouse.down();
	for (let i = 1; i <= 8; i++) {
		const a = start + (i / 8) * (Math.PI / 2);
		await page.mouse.move(centre.cx + Math.cos(a) * radius, centre.cy + Math.sin(a) * radius);
	}
	await page.mouse.up();
	await expect(selection(page)).toHaveAttribute('style', /rotate\(1\.5\d*rad\)/);
	await expect(page.getByTestId('handles')).not.toHaveAttribute('style', /rotate/);
});

test('each grip says what it does', async ({ page }) => {
	await page.getByRole('button', { name: 'Bloom', exact: true }).click();
	for (const [id, label] of [
		['move-handle', 'Move'],
		['rotate-handle', 'Turn'],
		['scale-handle', 'Resize']
	]) {
		await expect(page.getByTestId(id)).toHaveAttribute('title', new RegExp(label));
		await expect(page.getByTestId(id)).toContainText(label);
	}
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
