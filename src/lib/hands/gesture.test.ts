import { describe, expect, it } from 'vitest';
import { handEvent, readHand, type Landmark } from './gesture.js';

/** 21 landmarks for an upright hand; thumb tip (4) and index tip (8) set by the caller. */
function hand(thumb: [number, number], index: [number, number]): Landmark[] {
	const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
	lm[0] = { x: 0.5, y: 0.8, z: 0 };
	lm[9] = { x: 0.5, y: 0.6, z: 0 };
	lm[4] = { x: thumb[0], y: thumb[1], z: 0 };
	lm[8] = { x: index[0], y: index[1], z: 0 };
	return lm;
}

describe('readHand', () => {
	it('points between thumb and index, mirrored like a selfie', () => {
		const state = readHand(hand([0.2, 0.4], [0.3, 0.4]), false);
		expect(state.pointer.x).toBeCloseTo(0.75);
		expect(state.pointer.y).toBeCloseTo(0.4);
	});

	it('pinches when the fingertips are close relative to the size of the hand', () => {
		expect(readHand(hand([0.4, 0.4], [0.43, 0.4]), false).pinching).toBe(true);
		expect(readHand(hand([0.3, 0.4], [0.5, 0.4]), false).pinching).toBe(false);
	});

	it('holds a pinch through small wobbles, so it does not flicker', () => {
		const between = hand([0.4, 0.4], [0.475, 0.4]);
		expect(readHand(between, false).pinching).toBe(false);
		expect(readHand(between, true).pinching).toBe(true);
	});
});

describe('handEvent', () => {
	const at = (x: number, pinching: boolean) => ({ pointer: { x, y: 0.5 }, pinching });

	it('turns pinch changes into pointer-like down, move and up', () => {
		expect(handEvent(null, at(0.2, false))).toBe('hover');
		expect(handEvent(at(0.2, false), at(0.2, true))).toBe('down');
		expect(handEvent(at(0.2, true), at(0.3, true))).toBe('move');
		expect(handEvent(at(0.3, true), at(0.3, false))).toBe('up');
		expect(handEvent(at(0.3, true), null)).toBe('up');
		expect(handEvent(null, null)).toBe(null);
	});
});
