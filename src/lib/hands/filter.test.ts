import { describe, expect, it } from 'vitest';
import { OneEuro } from './filter.js';
import { random } from './synthetic.js';

const FPS = 30;
const POINTER = { minCutoff: 1, beta: 0.02, dCutoff: 1 };

function gaussian(seed: number) {
	const next = random(seed);
	return () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next());
}

const rms = (xs: number[], mean: number) =>
	Math.sqrt(xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / xs.length);

describe('OneEuro', () => {
	it('passes the first value straight through', () => {
		expect(new OneEuro(POINTER).filter(42, 0)).toBe(42);
	});

	it('cuts jitter at rest to well under half', () => {
		const filter = new OneEuro(POINTER);
		const noise = gaussian(7);
		const input = Array.from({ length: 90 }, () => 100 + 2 * noise());
		const output = input.map((x, i) => filter.filter(x, (i * 1000) / FPS));
		expect(rms(output.slice(30), 100)).toBeLessThan(0.5 * rms(input.slice(30), 100));
	});

	it('settles on a step within a second, without overshoot', () => {
		const filter = new OneEuro(POINTER);
		filter.filter(0, 0);
		const output = Array.from({ length: 30 }, (_, i) => filter.filter(100, ((i + 1) * 1000) / FPS));
		expect(output[0]).toBeGreaterThan(0);
		expect(output[0]).toBeLessThan(100);
		expect(output.at(-1)).toBeGreaterThan(95);
		expect(Math.max(...output)).toBeLessThanOrEqual(100);
	});

	it('keeps up with a fast sweep because beta raises the cutoff with speed', () => {
		const lag = (beta: number) => {
			const filter = new OneEuro({ ...POINTER, beta });
			let last = 0;
			for (let i = 0; i < 60; i++)
				last = (i * 1000) / FPS - filter.filter((i * 1000) / FPS, (i * 1000) / FPS);
			return last;
		};
		expect(lag(0.02)).toBeLessThan(25);
		expect(lag(0)).toBeGreaterThan(100);
	});

	it('ignores a repeated timestamp, and starts afresh after reset', () => {
		const filter = new OneEuro(POINTER);
		filter.filter(0, 0);
		const a = filter.filter(50, 33);
		expect(filter.filter(80, 33)).toBe(a);
		filter.reset();
		expect(filter.filter(80, 66)).toBe(80);
	});
});
