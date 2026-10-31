import { expect, test } from '@playwright/test';

test('the code drawer shows the current garden as runnable code', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('application').locator('canvas')).toBeVisible();
	await page.getByRole('button', { name: 'Bloom', exact: true }).click();

	const toggle = page.getByRole('button', { name: 'Code', exact: true });
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	const code = page.getByTestId('code');
	await expect(code).toContainText("import { P5Canvas } from 'svelte-p5';");
	await expect(code).toContainText('"kind": "bloom"');
	await expect(code).not.toContainText('"kind": "tree"');

	await page.getByRole('button', { name: 'Tree', exact: true }).click();
	await expect(code).toContainText('"kind": "tree"');

	await page.getByRole('tab', { name: 'p5.js' }).click();
	await expect(code).toContainText('new p5((p) => {');

	await page.getByRole('tab', { name: 'svelte-p5' }).click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download' }).click();
	expect((await download).suggestedFilename()).toBe('Garden.svelte');

	await expect(page.getByRole('link', { name: 'Open in playground' })).toHaveAttribute(
		'href',
		/^https:\/\/svelte-p5\.dev\/playground#code=[A-Za-z0-9_-]+$/
	);

	await page.getByRole('button', { name: 'Close code' }).click();
	await expect(code).toHaveCount(0);
	await expect(page.getByRole('complementary', { name: 'Selected plant' })).toBeVisible();
});
