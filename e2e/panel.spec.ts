import { expect, test, type Page } from '@playwright/test';

const centrePixel = (page: Page) =>
	page
		.getByRole('application')
		.locator('canvas')
		.evaluate((c: HTMLCanvasElement) => {
			const ctx = c.getContext('2d')!;
			return [...ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data.slice(0, 3)];
		});

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('application').locator('canvas')).toBeVisible();
	await page.getByRole('button', { name: 'Bloom' }).click();
	await page.getByRole('slider', { name: 'Speed' }).fill('0');
});

test('the panel shows the selected plant and an empty state otherwise', async ({ page }) => {
	const panel = page.getByRole('complementary', { name: 'Selected plant' });
	await expect(panel.getByRole('heading', { name: 'Bloom' })).toBeVisible();
	const s = (await page.getByRole('application').boundingBox())!;
	await page.mouse.click(s.x + 15, s.y + 15);
	await expect(panel).toContainText('Select a plant');
});

test('a colour preset recolours the plant on the canvas', async ({ page }) => {
	await page.getByRole('button', { name: 'Sunset' }).click();
	await page.waitForTimeout(150);
	const before = await centrePixel(page);
	const ocean = page.getByRole('button', { name: 'Ocean' });
	await ocean.click();
	await expect(ocean).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(() => centrePixel(page)).not.toEqual(before);
	await expect(page.getByRole('slider', { name: 'Hue' })).toHaveValue('200');
});

test('sliders and actions change the plant', async ({ page }) => {
	await page.getByRole('slider', { name: 'Size' }).fill('2');
	await expect(page.getByRole('slider', { name: 'Size' })).toHaveValue('2');
	const width = (await page.getByTestId('selection').boundingBox())!.width;
	await page.getByRole('slider', { name: 'Size' }).fill('1');
	expect((await page.getByTestId('selection').boundingBox())!.width).toBeLessThan(width * 0.6);

	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByTestId('selection')).toHaveCount(0);
});

test('every panel slider has an accessible name', async ({ page }) => {
	for (const name of ['Hue', 'Vividness', 'Density', 'Size', 'Turn', 'Speed']) {
		await expect(page.getByRole('slider', { name, exact: true })).toHaveCount(1);
	}
});
