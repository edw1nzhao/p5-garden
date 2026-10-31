import { expect, test, type Page } from '@playwright/test';

const heading = (page: Page) =>
	page.getByRole('complementary', { name: 'Selected plant' }).getByRole('heading');

test('clicking the same spot steps down through stacked plants', async ({ page }) => {
	await page.goto('/');
	const stage = page.getByRole('application');
	await expect(stage.locator('canvas')).toBeVisible();
	await page.getByRole('button', { name: 'Bloom', exact: true }).click();
	await page.getByRole('button', { name: 'Swarm', exact: true }).click();
	await expect(heading(page)).toHaveText('Swarm');

	const s = (await stage.boundingBox())!;
	const cx = s.x + s.width / 2;
	const cy = s.y + s.height / 2;
	await page.mouse.click(cx, cy);
	await expect(heading(page)).toHaveText('Bloom');
	await expect(page.getByText('Layer 2 of 2 here')).toBeVisible();
	await page.mouse.click(cx, cy);
	await expect(heading(page)).toHaveText('Swarm');

	// Selecting a lower plant does not raise it: a fresh click starts from the top again.
	await page.mouse.click(cx, cy);
	await expect(heading(page)).toHaveText('Bloom');
	await page.mouse.click(s.x + 20, s.y + s.height - 140);
	await page.mouse.click(cx, cy);
	await expect(heading(page)).toHaveText('Swarm');

	// A buried plant that is selected can be dragged out from under the others.
	await page.mouse.click(cx, cy);
	await expect(heading(page)).toHaveText('Bloom');
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx - 150, cy, { steps: 6 });
	await page.mouse.up();
	await expect(heading(page)).toHaveText('Bloom');
	const sel = (await page.getByTestId('selection').boundingBox())!;
	expect(sel.x + sel.width / 2).toBeCloseTo(cx - 150, 0);
});
