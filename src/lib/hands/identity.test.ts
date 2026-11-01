import { describe, expect, it } from 'vitest';
import type { Handedness, RawFrame, RawHand } from './frames.js';
import { HandSlots, LABEL_IS_USERS_HAND } from './identity.js';
import { createPipeline } from './pipeline.js';
import { replay } from './replay.js';
import { hand, random, type Pose } from './synthetic.js';
import { parseClip } from './frames.js';
import twoHandsText from './fixtures/two-hands.jsonl?raw';

const ASPECT = 4 / 3;
const FPS = 30;
const at = (x: number, y = 0.7, pose: Pose = 'open', label: Handedness = 'Right') =>
	hand([x, y], pose, { aspect: ASPECT, label });
const frame = (i: number, hands: RawHand[]): RawFrame => ({
	time: (i * 1000) / FPS,
	aspect: ASPECT,
	hands
});
const wristX = (h: RawHand | undefined) => h?.landmarks[0].x;

describe('HandSlots', () => {
	it('keeps the drawing hand when MediaPipe swaps the order of its results', () => {
		const events = replay(parseClip(twoHandsText), createPipeline());
		const xs = events.map((e) => e.pointer!.x);
		expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.05);
	});

	it('follows each hand through a crossing, despite merged frames and flickering labels', () => {
		const slots = new HandSlots();
		const drawing: number[] = [];
		const crossing: boolean[] = [];
		for (let i = 0; i < 30; i++) {
			const r = 0.25 + i * (0.5 / 29);
			const l = 0.75 - i * (0.5 / 29);
			const close = Math.abs(r - l) < 0.15;
			const right = at(r, 0.72, 'open', close ? 'Left' : 'Right');
			const left = at(l, 0.66, 'open', 'Left');
			const hands = Math.abs(r - l) < 0.06 ? [right] : i % 2 ? [left, right] : [right, left];
			const out = slots.update(frame(i, hands));
			drawing.push(wristX(out.drawing?.hand)!);
			crossing.push(out.crossing);
		}
		for (let i = 1; i < drawing.length; i++)
			expect(drawing[i]).toBeGreaterThanOrEqual(drawing[i - 1] - 1e-9);
		expect(drawing.at(-1)).toBeCloseTo(0.75);
		expect(crossing.some(Boolean)).toBe(true);
		expect(crossing.at(-1)).toBe(false);
	});

	it('holds a slot through a short dropout, and frees it after the grace window', () => {
		const slots = new HandSlots();
		const first = slots.update(frame(0, [at(0.3)])).drawing!.id;
		expect(slots.update(frame(1, [])).drawing?.id).toBe(first);
		expect(slots.update(frame(8, [])).drawing?.id).toBe(first);
		expect(slots.update(frame(9, [at(0.31)])).drawing?.id).toBe(first);
		expect(slots.update(frame(30, [])).drawing).toBeNull();
		expect(slots.update(frame(31, [at(0.3)])).drawing?.id).not.toBe(first);
	});

	it('ignores label flicker on a hand it already knows', () => {
		const slots = new HandSlots();
		const id = slots.update(frame(0, [at(0.3)])).drawing!.id;
		for (let i = 1; i < 10; i++) {
			const out = slots.update(frame(i, [at(0.3, 0.7, 'open', i % 2 ? 'Left' : 'Right')]));
			expect(out.drawing?.id).toBe(id);
			expect(out.off).toBeNull();
		}
	});

	it('gives the drawing role by label, and by side when both labels agree', () => {
		const byLabel = new HandSlots({ drawingHand: 'Left' });
		const out = byLabel.update(
			frame(0, [at(0.3, 0.7, 'open', 'Right'), at(0.7, 0.7, 'open', 'Left')])
		);
		expect(wristX(out.drawing?.hand)).toBeCloseTo(0.7);
		expect(wristX(out.off?.hand)).toBeCloseTo(0.3);

		const same = new HandSlots({ drawingHand: 'Right' });
		const tie = same.update(frame(0, [at(0.7, 0.7, 'open', 'Left'), at(0.3, 0.7, 'open', 'Left')]));
		expect(wristX(tie.drawing?.hand)).toBeCloseTo(0.3);
	});

	it('keeps a lone non-dominant hand off, however long it is alone', () => {
		const slots = new HandSlots({ drawingHand: 'Right' });
		let out = slots.update(frame(0, [at(0.7, 0.7, 'open', 'Left')]));
		for (let i = 1; i <= 30; i++) out = slots.update(frame(i, [at(0.7, 0.7, 'open', 'Left')]));
		expect(out.drawing).toBeNull();
		expect(out.off).not.toBeNull();
	});

	it('gives drawing to the dominant hand as soon as it appears, whichever came first', () => {
		for (const drawingHand of ['Right', 'Left'] as const) {
			const other = drawingHand === 'Right' ? 'Left' : 'Right';
			const slots = new HandSlots({ drawingHand });
			const early = slots.update(frame(0, [at(0.7, 0.7, 'open', other)]));
			for (let i = 1; i <= 10; i++) slots.update(frame(i, [at(0.7, 0.7, 'open', other)]));
			const both = slots.update(
				frame(11, [at(0.7, 0.7, 'open', other), at(0.3, 0.7, 'open', drawingHand)])
			);
			expect(wristX(both.drawing?.hand)).toBeCloseTo(0.3);
			expect(both.off?.id).toBe(early.off!.id);
		}
	});

	it('moves a hand first misread as dominant to off once its label settles, but not mid-stroke', () => {
		const run = (locked: boolean) => {
			const slots = new HandSlots({ drawingHand: 'Right' });
			let out = slots.update(frame(0, [at(0.6, 0.7, 'open', 'Right')]));
			for (let i = 1; i <= 20; i++)
				out = slots.update(frame(i, [at(0.6, 0.7, 'open', 'Left')]), { locked });
			return out;
		};
		expect(run(false).drawing).toBeNull();
		expect(run(true).drawing).not.toBeNull();
	});

	it('reads labels as the user’s own hands (unverified until the webcam check)', () => {
		expect(LABEL_IS_USERS_HAND).toBe(true);
		const out = new HandSlots({ drawingHand: 'Right' }).update(frame(0, [at(0.4)]));
		expect(out.drawing).not.toBeNull();
	});
});

describe('pipeline while hands cross', () => {
	it('does not start a pinch while the wrists overlap, but keeps one already held', () => {
		const run = (pinchFirst: boolean) => {
			const pipeline = createPipeline();
			const states = [];
			for (let i = 0; i < 6; i++) {
				const pose: Pose = pinchFirst || i >= 3 ? 'pinch' : 'open';
				const hands =
					i < 2 ? [at(0.3, 0.7, pose)] : [at(0.3, 0.7, pose), at(0.36, 0.7, 'open', 'Left')];
				states.push(pipeline(frame(i, hands)).drawing?.pinching);
			}
			return states;
		};
		expect(run(false)).toEqual([false, false, false, false, false, false]);
		expect(run(true)).toEqual([true, true, true, true, true, true]);
	});
});

describe('pipeline smoothing', () => {
	const ratioHand = (ratio: number) => {
		const h = at(0.4, 0.7, 'open');
		const [wrist, knuckle, index] = [h.landmarks[0], h.landmarks[9], h.landmarks[8]];
		const size = Math.hypot((wrist.x - knuckle.x) * ASPECT, wrist.y - knuckle.y);
		h.landmarks[4] = { x: index.x - (ratio * size) / ASPECT, y: index.y, z: index.z };
		return h;
	};
	const transitions = (states: (boolean | undefined)[]) =>
		states.slice(1).filter((s, i) => s !== states[i]).length;

	it('does not flicker when the fingers hover near the pinch threshold', () => {
		const noise = (() => {
			const next = random(11);
			return () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next());
		})();
		const ratios = Array.from({ length: 150 }, () => 0.37 + 0.06 * noise());
		const smooth = createPipeline();
		const filtered = ratios.map((r, i) => smooth(frame(i, [ratioHand(r)])).drawing?.pinching);
		let wasPinching = false;
		const raw = ratios.map((r) => {
			wasPinching = r < (wasPinching ? 0.45 : 0.3);
			return wasPinching;
		});
		expect(transitions(raw)).toBeGreaterThanOrEqual(6);
		expect(transitions(filtered)).toBeLessThanOrEqual(transitions(raw) / 3);
	});

	it('still registers a real pinch within three frames', () => {
		const pipeline = createPipeline();
		const states = Array.from(
			{ length: 10 },
			(_, i) => pipeline(frame(i, [ratioHand(i < 5 ? 1 : 0.05)])).drawing?.pinching
		);
		expect(states.indexOf(true)).toBeGreaterThanOrEqual(5);
		expect(states.indexOf(true)).toBeLessThanOrEqual(7);
	});
});
