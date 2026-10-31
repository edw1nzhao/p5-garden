import { expect, test, type Page } from '@playwright/test';

const stage = (page: Page) => page.getByRole('application');
const description = (page: Page) => stage(page).locator('canvas [aria-label="Canvas Description"]');

async function paint(page: Page, from: [number, number], to: [number, number]) {
	const s = (await stage(page).boundingBox())!;
	const at = ([fx, fy]: [number, number]) => [s.x + s.width * fx, s.y + s.height * fy] as const;
	const [x0, y0] = at(from);
	const [x1, y1] = at(to);
	await page.mouse.move(x0, y0);
	await page.mouse.down();
	for (let i = 1; i <= 12; i++) {
		const u = i / 12;
		await page.mouse.move(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + Math.sin(u * 6) * 20);
	}
	await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(stage(page).locator('canvas')).toBeVisible();
});

test('painting with each brush adds a selectable stroke', async ({ page }) => {
	const paintTool = page.getByRole('button', { name: 'Paint', exact: true });
	await paintTool.click();
	await expect(paintTool).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: 'Vine' })).toHaveAttribute('aria-pressed', 'true');

	await paint(page, [0.2, 0.3], [0.6, 0.35]);
	await expect(page.getByTestId('selection')).toBeVisible();
	await expect(description(page)).toContainText('1 painted vine');

	await page.getByRole('button', { name: 'Silk' }).click();
	await paint(page, [0.3, 0.7], [0.8, 0.6]);
	await expect(description(page)).toContainText('1 painted vine, 1 painted silk');
	await expect(page.getByRole('complementary', { name: 'Selected plant' })).toContainText('Paint');
});

test('a tiny tap in paint mode paints nothing', async ({ page }) => {
	await page.getByRole('button', { name: 'Paint', exact: true }).click();
	const s = (await stage(page).boundingBox())!;
	await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
	await expect(description(page)).toContainText('waiting for seeds');
});

test('in arrange mode a painted stroke moves like any plant', async ({ page }) => {
	await page.getByRole('button', { name: 'Paint', exact: true }).click();
	await paint(page, [0.3, 0.5], [0.5, 0.5]);
	await page.getByRole('button', { name: 'Arrange' }).click();
	const before = (await page.getByTestId('selection').boundingBox())!;
	const cx = before.x + before.width / 2;
	const cy = before.y + before.height / 2;
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + 100, cy + 50, { steps: 6 });
	await page.mouse.up();
	const after = (await page.getByTestId('selection').boundingBox())!;
	expect(after.x - before.x).toBeCloseTo(100, 0);
	expect(after.y - before.y).toBeCloseTo(50, 0);
});
