import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('Save poster downloads the garden at three times the canvas size', async ({ page }) => {
	await page.goto('/');
	const canvas = page.getByRole('application').locator('canvas');
	await expect(canvas).toBeVisible();
	await page.getByRole('button', { name: 'Bloom', exact: true }).click();

	const css = (await canvas.boundingBox())!;
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save poster' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/^p5-garden.*\.png$/);

	const png = readFileSync((await file.path())!);
	expect(png.readUInt32BE(16)).toBe(Math.round(css.width) * 3);
	expect(png.readUInt32BE(20)).toBe(Math.round(css.height) * 3);
	await expect(page.getByTestId('selection')).toBeVisible();
});
