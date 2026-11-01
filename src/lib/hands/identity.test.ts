import { describe, expect, it } from 'vitest';
import type { Handedness, RawFrame, RawHand } from './frames.js';
import { HandSlots, LABEL_IS_USERS_HAND } from './identity.js';
import { createPipeline } from './pipeline.js';
import { replay } from './replay.js';
import { hand, type Pose } from './synthetic.js';
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

	it('lets a lone off hand draw once it has been alone for a moment', () => {
		const slots = new HandSlots({ drawingHand: 'Right' });
		const first = slots.update(frame(0, [at(0.7, 0.7, 'open', 'Left')]));
		expect(first.drawing).toBeNull();
		expect(first.off).not.toBeNull();
		let out = first;
		for (let i = 1; i <= 10; i++) out = slots.update(frame(i, [at(0.7, 0.7, 'open', 'Left')]));
		expect(out.drawing?.id).toBe(first.off!.id);
		const later = slots.update(frame(11, [at(0.7, 0.7, 'open', 'Left'), at(0.3)]));
		expect(later.drawing?.id).toBe(first.off!.id);
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
				states.push(pipeline(frame(i, hands))?.pinching);
			}
			return states;
		};
		expect(run(false)).toEqual([false, false, false, false, false, false]);
		expect(run(true)).toEqual([true, true, true, true, true, true]);
	});
});
