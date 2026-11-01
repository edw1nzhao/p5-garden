import { execFileSync } from 'node:child_process';
import { expect, test } from 'vitest';

test('the committed hand model matches the pinned hash', () => {
	expect(() => execFileSync('node', ['scripts/fetch-hand-model.mjs', '--verify'])).not.toThrow();
});
