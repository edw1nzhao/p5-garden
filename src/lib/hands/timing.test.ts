import { describe, expect, it } from 'vitest';
import { createWithFallback, FrameStats } from './timing.js';

describe('createWithFallback', () => {
	it('uses the GPU when it works', async () => {
		const result = await createWithFallback(async (delegate) => `landmarker on ${delegate}`);
		expect(result).toEqual({ value: 'landmarker on GPU', delegate: 'GPU' });
	});

	it('retries on the CPU when the GPU delegate fails', async () => {
		const tried: string[] = [];
		const result = await createWithFallback(async (delegate) => {
			tried.push(delegate);
			if (delegate === 'GPU') throw new Error('WebGL unavailable');
			return 'cpu landmarker';
		});
		expect(tried).toEqual(['GPU', 'CPU']);
		expect(result).toEqual({ value: 'cpu landmarker', delegate: 'CPU' });
	});

	it('reports the CPU error when both fail', async () => {
		await expect(
			createWithFallback(async (delegate) => {
				throw new Error(`${delegate} failed`);
			})
		).rejects.toThrow('CPU failed');
	});
});

describe('FrameStats', () => {
	it('reports detect-time percentiles over recent frames', () => {
		const stats = new FrameStats(100);
		for (let ms = 1; ms <= 100; ms++) stats.detect(ms);
		expect(stats.summary().p50).toBe(50);
		expect(stats.summary().p95).toBe(95);
		for (let i = 0; i < 100; i++) stats.detect(1);
		expect(stats.summary().p95).toBe(1);
	});

	it('counts frames the camera presented that were never detected', () => {
		const stats = new FrameStats();
		stats.presented(10);
		stats.presented(11);
		stats.presented(14);
		expect(stats.summary().dropped).toBe(2);
	});
});
