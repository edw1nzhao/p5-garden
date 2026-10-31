import { describe, expect, it } from 'vitest';
import { elementRadius, hitTest, toLocal, type Placed } from './geometry.js';

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
