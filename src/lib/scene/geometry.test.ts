import { describe, expect, it } from 'vitest';
import { MIN_ZOOM } from '#lib/garden/view.svelte.js';
import {
	WORLD_MAX,
	WORLD_MIN,
	elementRadius,
	hitAll,
	hitTest,
	mirrorStroke,
	smoothPath,
	strokeFromPath,
	toLocal,
	type Placed
} from './geometry.js';

const stage = { width: 1000, height: 500 };
const at = (x: number, y: number, extra: Partial<Placed> = {}): Placed => ({
	id: `${x},${y}`,
	x,
	y,
	scale: 1,
	rotation: 0,
	...extra
});

describe('geometry', () => {
	it('sizes elements from the shorter side of the stage', () => {
		expect(elementRadius(at(0.5, 0.5), stage)).toBe(60);
		expect(elementRadius(at(0.5, 0.5, { scale: 2 }), stage)).toBe(120);
	});

	it('maps a stage point into an element’s rotated, scaled frame', () => {
		const el = at(0.5, 0.5, { rotation: Math.PI / 2, scale: 2 });
		const local = toLocal(el, 500, 250 + 120, stage);
		expect(local.x).toBeCloseTo(1);
		expect(local.y).toBeCloseTo(0);
	});

	it('hits the topmost element under the point, and misses empty space', () => {
		const bottom = at(0.5, 0.5);
		const top = at(0.52, 0.5);
		expect(hitTest([bottom, top], 515, 250, stage)?.id).toBe(top.id);
		expect(hitTest([bottom, top], 445, 250, stage)?.id).toBe(bottom.id);
		expect(hitTest([bottom, top], 50, 50, stage)).toBeNull();
	});
});

describe('strokeFromPath', () => {
	it('centres a stroke on its points and sizes it to reach the farthest one', () => {
		const shape = strokeFromPath(
			[
				{ x: 400, y: 250 },
				{ x: 500, y: 250 },
				{ x: 600, y: 250 }
			],
			stage
		);
		expect(shape.x).toBeCloseTo(0.5);
		expect(shape.y).toBeCloseTo(0.5);
		expect(shape.scale).toBeCloseTo(100 / 60);
		expect(shape.path).toEqual([-1, 0, 0, 0, 1, 0]);
	});

	it('keeps points in place when the scale clamps, so the stroke draws where it was painted', () => {
		const shape = strokeFromPath(
			[
				{ x: 499, y: 250 },
				{ x: 501, y: 250 }
			],
			stage
		);
		expect(shape.scale).toBe(0.3);
		const r = elementRadius({ id: 's', x: 0.5, y: 0.5, scale: shape.scale, rotation: 0 }, stage);
		expect(shape.path[0] * r).toBeCloseTo(-1);
	});
});

describe('smoothPath', () => {
	it('rounds corners but keeps both ends of the stroke', () => {
		const corner = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 }
		];
		const smooth = smoothPath(corner, 2);
		expect(smooth[0]).toEqual(corner[0]);
		expect(smooth.at(-1)).toEqual(corner[2]);
		expect(smooth.length).toBeGreaterThan(corner.length);
		expect(smooth.some((p) => p.x === 100 && p.y === 0)).toBe(false);
	});

	it('leaves paths too short to smooth alone', () => {
		const line = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 }
		];
		expect(smoothPath(line, 3)).toEqual(line);
	});
});

describe('hitAll', () => {
	it('lists every element under a point, topmost first', () => {
		const bottom = at(0.5, 0.5);
		const middle = at(0.51, 0.5);
		const top = at(0.52, 0.5);
		const away = at(0.1, 0.1);
		expect(hitAll([bottom, middle, away, top], 510, 250, stage).map((e) => e.id)).toEqual([
			top.id,
			middle.id,
			bottom.id
		]);
		expect(hitAll([bottom], 50, 50, stage)).toEqual([]);
	});
});

describe('mirrorStroke', () => {
	it('reflects the centre and the path across the middle of the stage', () => {
		const shape = { x: 0.3, y: 0.6, scale: 1.5, path: [-1, 0.5, 0, 0, 1, -0.5] };
		expect(mirrorStroke(shape)).toEqual({
			x: 0.7,
			y: 0.6,
			scale: 1.5,
			path: [1, 0.5, 0, 0, -1, -0.5]
		});
	});

	it('is its own inverse and leaves the original alone', () => {
		const shape = { x: 0.2, y: 0.4, scale: 1, path: [-1, 0, 1, 1] };
		const twice = mirrorStroke(mirrorStroke(shape));
		expect(twice.x).toBeCloseTo(shape.x);
		expect(twice.path).toEqual(shape.path);
		expect(shape.path).toEqual([-1, 0, 1, 1]);
	});

	it('bounds the world to the area visible at minimum zoom around the stage centre', () => {
		expect(WORLD_MIN).toBeCloseTo(0.5 - 1 / MIN_ZOOM);
		expect(WORLD_MAX).toBeCloseTo(0.5 + 1 / MIN_ZOOM);
		expect((WORLD_MIN + WORLD_MAX) / 2).toBe(0.5);
	});

	it('hits elements that sit outside the stage', () => {
		const out = at(-0.5, 1.5);
		expect(hitTest([out], -500, 750, stage)).toBe(out);
		expect(hitTest([out], 0, 0, stage)).toBeNull();
	});
});
