import { describe, expect, it } from 'vitest';
import { MODE_CONSTANTS } from './modes.js';
import { createRail, tileAt, type RailInput, type RailLayout } from './rail.js';

const layout: RailLayout = {
	rail: { left: 0, top: 0, right: 100, bottom: 300 },
	tiles: [
		{ id: 'bloom', left: 10, top: 10, right: 90, bottom: 90 },
		{ id: 'fern', left: 10, top: 100, right: 90, bottom: 180 }
	]
};
const DWELL = MODE_CONSTANTS.dwellMs;
const at = (x: number, y: number, pinching = false) => ({ x, y, pinching });
const BLOOM = [50, 50] as const;
const FERN = [50, 140] as const;
const AWAY = [500, 500] as const;
const draw = (p: readonly [number, number], pinching = false): RailInput => ({
	drawing: at(...p, pinching),
	off: null
});
const offHand = (p: readonly [number, number], pinching = false): RailInput => ({
	drawing: null,
	off: at(...p, pinching)
});

describe('tileAt', () => {
	it('finds the tile under a point and nothing in the gaps', () => {
		expect(tileAt(layout.tiles, 50, 50)).toBe('bloom');
		expect(tileAt(layout.tiles, 50, 95)).toBeNull();
		expect(tileAt(layout.tiles, 500, 50)).toBeNull();
	});
	it('ignores tiles with no area', () => {
		expect(tileAt([{ id: 'x', left: 5, top: 5, right: 5, bottom: 5 }], 5, 5)).toBeNull();
	});
});

describe('dwell', () => {
	it('fires once after dwellMs and reports progress on the way', () => {
		const rail = createRail();
		expect(rail.step(draw(BLOOM), layout, 0).hover.drawing).toEqual({ id: 'bloom', progress: 0 });
		const half = rail.step(draw(BLOOM), layout, DWELL / 2);
		expect(half.hover.drawing?.progress).toBeCloseTo(0.5);
		expect(half.selected).toEqual([]);
		const done = rail.step(draw(BLOOM), layout, DWELL);
		expect(done.selected).toEqual([{ id: 'bloom', role: 'drawing' }]);
	});

	it('does not repeat while the pointer stays on the tile', () => {
		const rail = createRail();
		rail.step(draw(BLOOM), layout, 0);
		rail.step(draw(BLOOM), layout, DWELL);
		for (let t = DWELL + 100; t < DWELL * 6; t += 100)
			expect(rail.step(draw(BLOOM), layout, t).selected).toEqual([]);
	});

	it('fires again after leaving and dwelling again', () => {
		const rail = createRail();
		rail.step(draw(BLOOM), layout, 0);
		rail.step(draw(BLOOM), layout, DWELL);
		rail.step(draw(AWAY), layout, DWELL + 50);
		rail.step(draw(BLOOM), layout, DWELL + 100);
		expect(rail.step(draw(BLOOM), layout, DWELL * 2 + 100).selected).toHaveLength(1);
	});

	it('resets when the pointer leaves the tile', () => {
		const rail = createRail();
		rail.step(draw(BLOOM), layout, 0);
		rail.step(draw(BLOOM), layout, DWELL - 100);
		const out = rail.step(draw(AWAY), layout, DWELL - 50);
		expect(out.hover.drawing).toBeNull();
		rail.step(draw(BLOOM), layout, DWELL);
		expect(rail.step(draw(BLOOM), layout, DWELL + 200).selected).toEqual([]);
		expect(rail.step(draw(BLOOM), layout, DWELL * 2).selected).toHaveLength(1);
	});

	it('restarts when moving from one tile to another', () => {
		const rail = createRail();
		rail.step(draw(BLOOM), layout, 0);
		rail.step(draw(FERN), layout, DWELL - 10);
		expect(rail.step(draw(FERN), layout, DWELL + 10).selected).toEqual([]);
		expect(rail.step(draw(FERN), layout, DWELL * 2 - 10).selected).toEqual([
			{ id: 'fern', role: 'drawing' }
		]);
	});
});

describe('pinch', () => {
	it('selects at once', () => {
		const rail = createRail();
		rail.step(draw(BLOOM), layout, 0);
		expect(rail.step(draw(BLOOM, true), layout, 50).selected).toEqual([
			{ id: 'bloom', role: 'drawing' }
		]);
	});

	it('does not repeat while held, nor dwell afterwards', () => {
		const rail = createRail();
		rail.step(draw(BLOOM), layout, 0);
		rail.step(draw(BLOOM, true), layout, 50);
		expect(rail.step(draw(BLOOM, true), layout, 100).selected).toEqual([]);
		expect(rail.step(draw(BLOOM), layout, DWELL * 2).selected).toEqual([]);
	});

	it('ignores a pinch carried onto the tile until it is released', () => {
		const rail = createRail();
		rail.step(draw(AWAY, true), layout, 0);
		expect(rail.step(draw(BLOOM, true), layout, 50).selected).toEqual([]);
		expect(rail.step(draw(BLOOM, true), layout, DWELL * 2).selected).toEqual([]);
		rail.step(draw(BLOOM), layout, DWELL * 2 + 50);
		expect(rail.step(draw(BLOOM, true), layout, DWELL * 2 + 100).selected).toHaveLength(1);
	});
});

describe('roles', () => {
	it('lets the off hand latch a seed and the same tile unlatch it', () => {
		const rail = createRail();
		rail.step(offHand(BLOOM), layout, 0);
		const latched = rail.step(offHand(BLOOM, true), layout, 50);
		expect(latched.selected).toEqual([{ id: 'bloom', role: 'off' }]);
		expect(latched.latched).toBe('bloom');
		rail.step(offHand(AWAY), layout, 100);
		rail.step(offHand(BLOOM), layout, 150);
		expect(rail.step(offHand(BLOOM), layout, 150 + DWELL).latched).toBeNull();
	});

	it('switches the latch to another tile', () => {
		const rail = createRail();
		rail.step(offHand(BLOOM, true), layout, 0);
		rail.step(offHand(FERN), layout, 50);
		expect(rail.step(offHand(FERN, true), layout, 100).latched).toBe('fern');
	});

	it('does not change the latch when the drawing hand selects', () => {
		const rail = createRail();
		rail.step(offHand(BLOOM), layout, 0);
		rail.step(offHand(BLOOM, true), layout, 10);
		rail.step({ drawing: at(...FERN), off: at(...BLOOM, true) }, layout, 20);
		const out = rail.step({ drawing: at(...FERN, true), off: at(...BLOOM, true) }, layout, 50);
		expect(out.selected).toEqual([{ id: 'fern', role: 'drawing' }]);
		expect(out.latched).toBe('bloom');
	});

	it('clears the latch on escape', () => {
		const rail = createRail();
		rail.step(offHand(BLOOM, true), layout, 0);
		rail.clearLatch();
		expect(rail.latched).toBeNull();
		expect(rail.step(offHand(AWAY), layout, 50).latched).toBeNull();
	});

	it('tracks the two hands independently', () => {
		const rail = createRail();
		const both = (t: number) => rail.step({ drawing: at(...BLOOM), off: at(...FERN) }, layout, t);
		both(0);
		expect(both(DWELL).selected).toEqual([
			{ id: 'bloom', role: 'drawing' },
			{ id: 'fern', role: 'off' }
		]);
	});
});

describe('canvas suppression', () => {
	it('reports a hand over a tile or anywhere on the rail', () => {
		const rail = createRail();
		expect(rail.step(draw(BLOOM), layout, 0).over.drawing).toBe(true);
		expect(rail.step(draw([50, 95]), layout, 10).over.drawing).toBe(true);
		expect(rail.step(draw(AWAY), layout, 20).over.drawing).toBe(false);
	});

	it('is false with no hand, and with an empty layout', () => {
		const rail = createRail();
		const none = rail.step({ drawing: null, off: null }, layout, 0);
		expect(none.over).toEqual({ drawing: false, off: false });
		expect(rail.step(draw(BLOOM), { rail: null, tiles: [] }, 10).over.drawing).toBe(false);
	});
});
