import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, View } from './view.svelte.js';

describe('View', () => {
	it('starts as the identity', () => {
		const view = new View();
		expect(view.toWorld({ x: 12, y: 34 })).toEqual({ x: 12, y: 34 });
		expect(view.toScreen({ x: 12, y: 34 })).toEqual({ x: 12, y: 34 });
	});

	it('round-trips between world and screen', () => {
		const view = new View();
		view.zoomAt(2.5, 300, 200);
		view.panBy(-40, 25);
		const p = { x: 123, y: 456 };
		const back = view.toWorld(view.toScreen(p));
		expect(back.x).toBeCloseTo(p.x, 9);
		expect(back.y).toBeCloseTo(p.y, 9);
	});

	it('keeps the point under the cursor fixed while zooming', () => {
		const view = new View();
		view.panBy(30, -10);
		const before = view.toWorld({ x: 400, y: 250 });
		view.zoomAt(1.7, 400, 250);
		const after = view.toWorld({ x: 400, y: 250 });
		expect(after.x).toBeCloseTo(before.x, 9);
		expect(after.y).toBeCloseTo(before.y, 9);
		expect(view.zoom).toBeCloseTo(1.7, 9);
	});

	it('clamps zoom, and stays anchored at the limit', () => {
		const view = new View();
		view.zoomAt(100, 200, 100);
		expect(view.zoom).toBe(MAX_ZOOM);
		const at = view.toWorld({ x: 200, y: 100 });
		view.zoomAt(2, 200, 100);
		expect(view.zoom).toBe(MAX_ZOOM);
		expect(view.toWorld({ x: 200, y: 100 })).toEqual(at);
		view.zoomAt(0.0001, 0, 0);
		expect(view.zoom).toBe(MIN_ZOOM);
	});

	it('pans in screen pixels and resets', () => {
		const view = new View();
		view.zoomAt(2, 0, 0);
		view.panBy(10, 20);
		expect(view.toScreen({ x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
		view.reset();
		expect(view).toMatchObject({ zoom: 1, x: 0, y: 0 });
	});
});
