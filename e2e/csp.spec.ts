import { expect, test } from '@playwright/test';

test.use({
	permissions: ['camera'],
	launchOptions: {
		args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
	}
});

test('hand tracking runs with a strict CSP and no third-party requests', async ({ page }) => {
	const violations: string[] = [];
	const foreign: string[] = [];
	page.on('console', (m) => {
		if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
	});
	await page.addInitScript(() =>
		document.addEventListener('securitypolicyviolation', (e) =>
			console.error(
				`Content Security Policy: ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber} ${e.sample}`
			)
		)
	);
	page.on('request', (r) => {
		const url = new URL(r.url());
		if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:4173')
			foreign.push(r.url());
	});

	const response = await page.goto('/');
	expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
	await expect(page.getByRole('application').locator('canvas')).toBeVisible();
	await page.getByRole('button', { name: 'Code', exact: true }).click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save poster' }).click();
	await download;
	await page.getByRole('button', { name: 'Hands', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Hands', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
		{ timeout: 30_000 }
	);

	expect(violations).toEqual([]);
	expect(foreign).toEqual([]);

	await page.evaluate(() => dispatchEvent(new Event('pagehide')));
	await expect(page.getByRole('button', { name: 'Hands', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
});
