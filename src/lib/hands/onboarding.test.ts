import { describe, expect, it } from 'vitest';
import { CALIBRATED_SHAPES, type CalibratedShape } from './calibration.js';
import type { Handedness } from './frames.js';
import { Guide, GUIDE_CONSTANTS, type GuideEffect, type GuideInput } from './onboarding.js';
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

describe('hands-free success beats', () => {
	it('moves from the right-hand step to the pinch step by itself after the beat', () => {
		const guide = new Guide();
		feed(guide, frames(C.handHoldMs), () => ({ raw: [raw('Right')] }));
		expect(guide.state.step).toBe('hand');
		guide.tick(C.handHoldMs + C.successMs + 50);
		expect(guide.state.step).toBe('pinch');
	});

	it('moves from the pinch step to calibration by itself after the beat', () => {
		const guide = new Guide('pinch');
		feed(guide, 3, () => ({ drawing: reading('pinch') }));
		expect(guide.state.step).toBe('pinch');
		guide.tick(3 * MS + C.successMs + 50);
		expect(guide.state.step).toBe('calibrate');
	});
});

describe('step 3: calibration', () => {
	const off = (shape: CalibratedShape, x = 0.3) => ({ off: reading(shape, { x, y: 0.6 }) });
	/** Feeds frames of the same pose for `ms`, returning the time reached. */
	const run = (guide: Guide, start: number, ms: number, make: () => Partial<GuideInput>) => {
		const n = Math.ceil(ms / MS);
		for (let i = 0; i < n; i++) guide.feed({ ...input(0, make()), time: start + i * MS });
		return start + n * MS;
	};
	/** Steps frames until the guide reaches `phase`, returning the time reached. */
	const until = (guide: Guide, start: number, phase: string, make: () => Partial<GuideInput>) => {
		let t = start;
		while (guide.state.calibrate.phase !== phase && t < start + 60_000) {
			guide.feed({ ...input(0, make()), time: t });
			t += MS;
		}
		return t;
	};
	const toCountdown = (guide: Guide, shape: CalibratedShape, start = 0) =>
		until(guide, start, 'countdown', () => off(shape));
	const toCapture = (guide: Guide, shape: CalibratedShape, start = 0) =>
		until(guide, toCountdown(guide, shape, start), 'capturing', () => off(shape));
	const toConfirm = (guide: Guide, shape: CalibratedShape, start = 0, phase = 'confirm') =>
		until(guide, toCapture(guide, shape, start), phase, () => off(shape));
	const toNext = (guide: Guide, shape: CalibratedShape, start = 0) =>
		run(guide, toConfirm(guide, shape, start), C.confirmMs + 2 * MS, () => off(shape));

	it('waits for the off hand with no timeout', () => {
		const guide = new Guide('calibrate');
		run(guide, 0, 120_000, () => ({}));
		const { calibrate, status } = guide.state;
		expect(calibrate.phase).toBe('waiting');
		expect(calibrate.shape).toBe('fist');
		expect(status).toMatch(/show your other hand/i);
	});

	it('does not leave waiting while the hand keeps moving', () => {
		const guide = new Guide('calibrate');
		let i = 0;
		run(guide, 0, 5000, () => off('fist', 0.1 + (i++ % 40) * 0.02));
		expect(guide.state.calibrate.phase).toBe('waiting');
	});

	it('starts a 3, 2, 1 countdown once the hand is present and steady', () => {
		const guide = new Guide('calibrate');
		let t = toCountdown(guide, 'fist');
		expect(guide.state.calibrate.phase).toBe('countdown');
		expect(guide.state.calibrate.countdown).toBe(3);
		t = run(guide, t, C.countdownMs / 2, () => off('fist'));
		expect(guide.state.calibrate.countdown).toBe(2);
		run(guide, t, C.countdownMs * 0.4, () => off('fist'));
		expect(guide.state.calibrate.countdown).toBe(1);
	});

	it('goes back to waiting when the hand leaves during the countdown', () => {
		const guide = new Guide('calibrate');
		const t = toCountdown(guide, 'fist');
		run(guide, t, 3 * MS, () => ({}));
		expect(guide.state.calibrate.phase).toBe('waiting');
	});

	it('goes back to waiting when the hand moves fast during the countdown', () => {
		const guide = new Guide('calibrate');
		let t = toCountdown(guide, 'fist');
		guide.feed({ ...input(0, off('fist', 0.3)), time: t + MS });
		guide.feed({ ...input(0, off('fist', 0.6)), time: t + 2 * MS });
		expect(guide.state.calibrate.phase).toBe('waiting');
		t += 3 * MS;
	});

	it('captures nothing until the countdown ends, then fills the ring', () => {
		const guide = new Guide('calibrate');
		let t = toCountdown(guide, 'fist');
		t = run(guide, t, C.countdownMs - 200, () => off('fist'));
		expect(guide.state.calibrate.phase).toBe('countdown');
		expect(guide.state.calibrate.progress).toBe(0);
		t = run(guide, t, 400, () => off('fist'));
		expect(guide.state.calibrate.phase).toBe('capturing');
		run(guide, t, C.shapeHoldMs / 2, () => off('fist'));
		const { progress } = guide.state.calibrate;
		expect(progress).toBeGreaterThan(0.3);
		expect(progress).toBeLessThan(0.8);
	});

	it('does not count frames while the wrist is moving during capture', () => {
		const guide = new Guide('calibrate');
		const t = toCapture(guide, 'fist');
		const before = guide.state.calibrate.progress;
		let i = 0;
		run(guide, t, C.shapeHoldMs * 2, () => off('fist', 0.1 + 0.03 * i++));
		expect(guide.state.calibrate.progress).toBe(before);
	});

	it('shows a confirm beat, then moves to the next shape by itself', () => {
		const guide = new Guide('calibrate');
		const t = toConfirm(guide, 'fist');
		expect(guide.state.calibrate.phase).toBe('confirm');
		expect(guide.state.calibrate.done).toEqual(['fist']);
		expect(guide.state.status).toMatch(/got it/i);
		run(guide, t, C.confirmMs + 2 * MS, () => off('fist'));
		expect(guide.state.calibrate.shape).toBe('one');
		expect(guide.state.calibrate.phase).toBe('waiting');
	});

	it('redoes a shape that looks like an earlier one, then lets the user retry', () => {
		const guide = new Guide('calibrate');
		const t = toNext(guide, 'fist');
		const end = toConfirm(guide, 'fist', t, 'retry');
		const { calibrate } = guide.state;
		expect(calibrate.phase).toBe('retry');
		expect(calibrate.shape).toBe('one');
		expect(calibrate.confusedWith).toBe('fist');
		expect(calibrate.done).toEqual(['fist']);
		run(guide, end, C.retryMs + 2 * MS, () => off('fist'));
		expect(guide.state.calibrate.phase).toBe('waiting');
		expect(guide.state.calibrate.shape).toBe('one');
	});

	it('accepts a confusable shape after the redo cap and flags it', () => {
		const guide = new Guide('calibrate');
		let t = toNext(guide, 'fist');
		for (let redo = 0; redo < C.maxRedos; redo++) {
			t = toConfirm(guide, 'fist', t, 'retry');
			t = run(guide, t, C.retryMs + 2 * MS, () => off('fist'));
		}
		t = toConfirm(guide, 'fist', t);
		const { calibrate } = guide.state;
		expect(calibrate.phase).toBe('confirm');
		expect(calibrate.done).toEqual(['fist', 'one']);
		expect(calibrate.lowConfidence).toEqual(['one']);
		run(guide, t, C.confirmMs + 2 * MS, () => off('fist'));
		expect(guide.state.calibrate.shape).toBe('two');
	});

	it('redo previous goes back to the last captured shape', () => {
		const guide = new Guide('calibrate');
		toNext(guide, 'fist');
		expect(guide.state.calibrate.shape).toBe('one');
		guide.redoPrevious();
		expect(guide.state.calibrate.shape).toBe('fist');
		expect(guide.state.calibrate.done).toEqual([]);
		expect(guide.state.calibrate.phase).toBe('waiting');
		expect(guide.state.calibrate.progress).toBe(0);
	});

	it('skipping calibration leaves no templates', () => {
		const guide = new Guide('calibrate');
		toConfirm(guide, 'fist');
		guide.next();
		expect(guide.state.step).toBe('done');
		expect(guide.state.calibrate.templates).toBeNull();
	});
});

describe('the whole guide with zero clicks', () => {
	function play(holdDone?: (guide: Guide, t: number) => void) {
		const guide = new Guide();
		const effects: GuideEffect[] = [];
		const seen = new Set<string>();
		let t = 0;
		for (; t < 120_000 && !effects.some((e) => e.type === 'close'); t += MS) {
			const { step, calibrate } = guide.state;
			seen.add(step);
			holdDone?.(guide, t);
			effects.push(
				...guide.feed({
					time: t,
					raw: step === 'hand' ? [raw('Right')] : [],
					drawing: step === 'pinch' ? reading('pinch') : null,
					off: step === 'calibrate' && calibrate.shape ? reading(calibrate.shape) : null
				})
			);
		}
		return { guide, effects, seen, t };
	}

	it('completes, saves the templates and closes by itself', () => {
		const { guide, effects, seen } = play();
		expect([...seen]).toEqual(['hand', 'pinch', 'calibrate', 'done']);
		const saved = effects.flatMap((e) => (e.type === 'calibrated' ? [e.templates] : []));
		expect(saved).toHaveLength(1);
		expect(Object.keys(saved[0])).toEqual([...CALIBRATED_SHAPES]);
		expect(effects.at(-1)).toEqual({ type: 'close' });
		expect(guide.state.calibrate.lowConfidence).toEqual([]);
	});

	it('does not close while the card is hovered or focused', () => {
		const { effects } = play((guide) => guide.state.step === 'done' && guide.hold(true));
		expect(effects.some((e) => e.type === 'close')).toBe(false);
	});

	it('closes doneCloseMs after the last shape', () => {
		const guide = new Guide('done');
		expect(guide.tick(0)).toEqual([]);
		expect(guide.tick(C.doneCloseMs - 1)).toEqual([]);
		expect(guide.tick(C.doneCloseMs)).toEqual([{ type: 'close' }]);
		expect(guide.tick(C.doneCloseMs + 1000)).toEqual([]);
	});
});
