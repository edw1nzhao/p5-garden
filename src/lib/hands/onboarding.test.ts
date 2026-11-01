import { describe, expect, it } from 'vitest';
import { CALIBRATED_SHAPES, type CalibratedShape } from './calibration.js';
import type { Handedness } from './frames.js';
import { Guide, GUIDE_CONSTANTS, type GuideInput } from './onboarding.js';
import type { HandReading } from './pipeline.js';
import { measure } from './shapes.js';
import { hand } from './synthetic.js';

const C = GUIDE_CONSTANTS;
const MS = 1000 / 30;
const ASPECT = 4 / 3;

function reading(shape: CalibratedShape | 'pinch', wrist = { x: 0.3, y: 0.6 }): HandReading {
	const pose = shape === 'pinch' ? 'pinch' : shape;
	const measures = measure(hand([0.5, 0.6], pose, { aspect: ASPECT }).landmarks, ASPECT);
	return {
		id: 1,
		pointer: wrist,
		pinching: shape === 'pinch',
		shape,
		wrist,
		openness: 1,
		confidence: 1,
		measures
	};
}

const raw = (label: Handedness, score = 0.95) => ({ label, score });
const input = (i: number, over: Partial<GuideInput> = {}, start = 0): GuideInput => ({
	time: start + i * MS,
	raw: [],
	drawing: null,
	off: null,
	...over
});
const frames = (ms: number) => Math.ceil(ms / MS) + 1;

function feed(guide: Guide, n: number, make: (i: number) => Partial<GuideInput>, start = 0) {
	const effects = [];
	for (let i = 0; i < n; i++) effects.push(...guide.feed(input(i, make(i), start)));
	return effects;
}

describe('step 1: which label is my right hand', () => {
	it('keeps the standard convention when a lone right hand is labelled Right', () => {
		const guide = new Guide();
		const effects = feed(guide, frames(C.handHoldMs), () => ({ raw: [raw('Right')] }));
		expect(effects).toEqual([{ type: 'labelsInverted', value: false }]);
		expect(guide.state.hand.detected).toBe('Right');
	});

	it('flags inverted labels when a lone right hand is labelled Left', () => {
		const guide = new Guide();
		const effects = feed(guide, frames(C.handHoldMs), () => ({ raw: [raw('Left')] }));
		expect(effects).toEqual([{ type: 'labelsInverted', value: true }]);
	});

	it('reports progress and does not conclude early', () => {
		const guide = new Guide();
		const effects = feed(guide, frames(C.handHoldMs / 2), () => ({ raw: [raw('Left')] }));
		expect(effects).toEqual([]);
		expect(guide.state.hand.progress).toBeGreaterThan(0.4);
		expect(guide.state.hand.detected).toBeNull();
	});

	it.each<[string, GuideInput['raw']]>([
		['two hands show', [raw('Right'), raw('Left')]],
		['no hand shows', []],
		['the hand is uncertain', [raw('Left', 0.4)]]
	])('does not conclude when %s', (_, hands) => {
		const guide = new Guide();
		expect(feed(guide, frames(C.handHoldMs * 2), () => ({ raw: hands }))).toEqual([]);
	});

	it('restarts when the label flickers', () => {
		const guide = new Guide();
		const labels = (i: number) => ({ raw: [raw(i % 10 === 9 ? 'Left' : 'Right')] });
		expect(feed(guide, frames(C.handHoldMs * 0.9), labels)).toEqual([]);
	});

	it('stops listening once decided', () => {
		const guide = new Guide();
		feed(guide, frames(C.handHoldMs), () => ({ raw: [raw('Right')] }));
		const later = feed(guide, frames(C.handHoldMs), () => ({ raw: [raw('Left')] }), 5000);
		expect(later).toEqual([]);
		expect(guide.state.hand.detected).toBe('Right');
	});
});

describe('steps move on, and every step can be skipped', () => {
	it('goes hand, pinch, calibrate, done with skip or next', () => {
		const guide = new Guide();
		const steps = [guide.state.step];
		for (let i = 0; i < 4; i++) {
			guide.next();
			steps.push(guide.state.step);
		}
		expect(steps).toEqual(['hand', 'pinch', 'calibrate', 'done', 'done']);
	});

	it('can start at the calibration step', () => {
		expect(new Guide('calibrate').state.step).toBe('calibrate');
	});

	it('announces the step in the live status text', () => {
		const guide = new Guide();
		expect(guide.state.status).toMatch(/right hand/i);
		guide.next();
		expect(guide.state.status).toMatch(/pinch/i);
	});
});

describe('step 2: pinch', () => {
	it('ticks when the drawing hand pinches, not for the off hand or an open hand', () => {
		const guide = new Guide('pinch');
		feed(guide, 10, () => ({ drawing: reading('open'), off: reading('pinch') }));
		expect(guide.state.pinched).toBe(false);
		feed(guide, 3, () => ({ drawing: reading('pinch') }), 1000);
		expect(guide.state.pinched).toBe(true);
	});
});

describe('step 3: calibration', () => {
	const holdShape = (guide: Guide, shape: CalibratedShape, start: number, jitter = 0) =>
		feed(
			guide,
			frames(C.settleMs + C.shapeHoldMs + 200),
			(i) => ({ off: reading(shape, { x: 0.3 + (i % 2) * jitter, y: 0.6 }) }),
			start
		);

	it('asks for the shapes in order and fills a ring while the hand is steady', () => {
		const guide = new Guide('calibrate');
		expect(guide.state.calibrate.shape).toBe('fist');
		feed(guide, frames(C.settleMs + C.shapeHoldMs / 2), () => ({ off: reading('fist') }));
		const { progress } = guide.state.calibrate;
		expect(progress).toBeGreaterThan(0.3);
		expect(progress).toBeLessThan(0.7);
	});

	it('moves to the next shape after a full hold and finishes with all six templates', () => {
		const guide = new Guide('calibrate');
		let start = 0;
		for (const shape of CALIBRATED_SHAPES) {
			expect(guide.state.calibrate.shape).toBe(shape);
			holdShape(guide, shape, start);
			start += 10_000;
		}
		const { calibrate } = guide.state;
		expect(calibrate.shape).toBeNull();
		expect(calibrate.done).toEqual([...CALIBRATED_SHAPES]);
		expect(Object.keys(calibrate.templates!)).toEqual([...CALIBRATED_SHAPES]);
		expect(calibrate.warning).toBeNull();
	});

	it('does not count frames while the wrist is moving', () => {
		const guide = new Guide('calibrate');
		feed(guide, frames(C.settleMs + C.shapeHoldMs * 3), (i) => ({
			off: reading('fist', { x: 0.1 + i * 0.03, y: 0.6 })
		}));
		expect(guide.state.calibrate.progress).toBe(0);
		expect(guide.state.calibrate.shape).toBe('fist');
	});

	it('does not count frames without an off hand and does not bridge gaps', () => {
		const guide = new Guide('calibrate');
		feed(guide, frames(C.settleMs + C.shapeHoldMs * 0.4), () => ({ off: reading('fist') }));
		const before = guide.state.calibrate.progress;
		feed(guide, 60, () => ({}), 3000);
		feed(guide, 2, () => ({ off: reading('fist') }), 6000);
		expect(guide.state.calibrate.progress).toBeCloseTo(before, 1);
	});

	it('lets you retry a shape after it is done', () => {
		const guide = new Guide('calibrate');
		holdShape(guide, 'fist', 0);
		expect(guide.state.calibrate.done).toEqual(['fist']);
		guide.retry('fist');
		expect(guide.state.calibrate.shape).toBe('fist');
		expect(guide.state.calibrate.done).toEqual([]);
		expect(guide.state.calibrate.progress).toBe(0);
	});

	it('warns when two shapes came out too alike', () => {
		const guide = new Guide('calibrate');
		let start = 0;
		for (const shape of CALIBRATED_SHAPES) {
			holdShape(guide, shape === 'one' ? 'fist' : shape, start);
			start += 10_000;
		}
		expect(guide.state.calibrate.warning).toMatch(/fist/);
		expect(guide.state.calibrate.warning).toMatch(/one/);
	});

	it('skipping calibration leaves no templates', () => {
		const guide = new Guide('calibrate');
		holdShape(guide, 'fist', 0);
		guide.next();
		expect(guide.state.step).toBe('done');
		expect(guide.state.calibrate.templates).toBeNull();
	});
});
