import { describe, expect, it } from 'vitest';
import { handEvent, pinchRatio, readHand, type Landmark } from './gesture.js';

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
		const state = readHand(hand([0.2, 0.4], [0.3, 0.4]), false, 1);
		expect(state.pointer.x).toBeCloseTo(0.75);
		expect(state.pointer.y).toBeCloseTo(0.4);
	});

	it('pinches when the fingertips are close relative to the size of the hand', () => {
		expect(readHand(hand([0.4, 0.4], [0.43, 0.4]), false, 1).pinching).toBe(true);
		expect(readHand(hand([0.3, 0.4], [0.5, 0.4]), false, 1).pinching).toBe(false);
	});

	it('holds a pinch through small wobbles, so it does not flicker', () => {
		const between = hand([0.4, 0.4], [0.475, 0.4]);
		expect(readHand(between, false, 1).pinching).toBe(false);
		expect(readHand(between, true, 1).pinching).toBe(true);
	});
});

describe('pinchRatio', () => {
	/** Wrist, middle knuckle, thumb and index tips at points given in frame heights, on a w:h frame. */
	function framed(aspect: number, points: [number, number][]): Landmark[] {
		const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
		[0, 9, 4, 8].forEach((i, k) => (lm[i] = { x: points[k][0] / aspect, y: points[k][1], z: 0 }));
		return lm;
	}

	it('reads the same pinch whichever way the hand faces on a 4:3 frame', () => {
		const aspect = 4 / 3;
		const upright = framed(aspect, [
			[0.6, 0.8],
			[0.6, 0.6],
			[0.57, 0.5],
			[0.63, 0.5]
		]);
		const sideways = framed(aspect, [
			[0.4, 0.5],
			[0.6, 0.5],
			[0.7, 0.47],
			[0.7, 0.53]
		]);
		expect(pinchRatio(upright, aspect)).toBeCloseTo(0.3);
		expect(pinchRatio(sideways, aspect)).toBeCloseTo(0.3);
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
