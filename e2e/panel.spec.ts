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

const cornerPixel = (page: Page) =>
	page
		.getByRole('application')
		.locator('canvas')
		.evaluate((c: HTMLCanvasElement) => {
			const ctx = c.getContext('2d')!;
			return [...ctx.getImageData(4, 4, 1, 1).data.slice(0, 3)];
		});

test('with nothing selected the panel sets the garden mood', async ({ page }) => {
	const s = (await page.getByRole('application').boundingBox())!;
	await page.mouse.click(s.x + 15, s.y + 15);
	const before = await cornerPixel(page);
	const paper = page.getByRole('button', { name: 'Paper' });
	await paper.click();
	await expect(paper).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(() => cornerPixel(page)).not.toEqual(before);
	await expect(page.getByRole('button', { name: 'Glow' })).toBeDisabled();
	await expect(
		page.getByRole('application').locator('canvas [aria-label="Canvas Description"]')
	).toContainText('warm paper');

	await page.getByRole('button', { name: 'Dusk' }).click();
	const glow = page.getByRole('button', { name: 'Glow' });
	await glow.click();
	await expect(glow).toHaveAttribute('aria-pressed', 'true');
	const react = page.getByRole('button', { name: 'React to pointer' });
	await expect(react).toHaveAttribute('aria-pressed', 'false');
	await react.click();
	await expect(react).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('slider', { name: 'Wind' }).fill('0.6');
	await expect(page.getByRole('slider', { name: 'Wind' })).toHaveValue('0.6');
});

test('on a phone the inspector opens only from Tune, so the canvas stays clear', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const inspector = page.getByRole('complementary', { name: 'Selected plant' });
	await expect(inspector).toBeHidden();
	const tune = page.getByRole('button', { name: 'Tune' });
	await tune.click();
	await expect(tune).toHaveAttribute('aria-pressed', 'true');
	await expect(inspector.getByRole('heading', { name: 'Bloom' })).toBeVisible();
});

test('garden settings stay reachable while a plant is selected', async ({ page }) => {
	await expect(page.getByRole('heading', { name: 'Bloom' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'React to pointer' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Dusk' })).toBeVisible();
});
