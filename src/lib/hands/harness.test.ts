import { describe, expect, it } from 'vitest';
import { pinchRatio } from './gesture.js';
import { parseClip, serializeClip, toRawFrame, type RawFrame } from './frames.js';
import { createPipeline } from './pipeline.js';
import { replay } from './replay.js';
import { hand } from './synthetic.js';
import pinchDragText from './fixtures/pinch-drag.jsonl?raw';
import twoHandsText from './fixtures/two-hands.jsonl?raw';

const ASPECT = 4 / 3;

/** One hand hovers, pinches, drags right, and lets go: 30 frames at 30 fps. */
function pinchDrag(): RawFrame[] {
	return Array.from({ length: 30 }, (_, i) => {
		const pose = i >= 8 && i < 22 ? 'pinch' : 'open';
		const x = 0.3 + Math.max(0, Math.min(i - 8, 14)) * 0.02;
		return {
			time: Math.round((i * 1000) / 30),
			aspect: ASPECT,
			hands: [hand([x, 0.7], pose, { aspect: ASPECT, seed: i, noise: 0.002 })]
		};
	});
}

/** Two still hands; the tracker's output order swaps half way, as MediaPipe's may. */
function twoHands(): RawFrame[] {
	return Array.from({ length: 20 }, (_, i) => {
		const opts = { aspect: ASPECT, seed: i, noise: 0.002 };
		const right = hand([0.35, 0.7], 'point', { ...opts, label: 'Right' });
		const left = hand([0.7, 0.7], 'open', { ...opts, label: 'Left' });
		const hands = i < 10 ? [right, left] : [left, right];
		return { time: Math.round((i * 1000) / 30), aspect: ASPECT, hands };
	});
}

describe('synthetic hands', () => {
	it('pinches in the pinch pose and not open or pointing, at any roll', () => {
		for (const roll of [0, 45, 90, 180]) {
			const at: [number, number] = [0.5, 0.6];
			expect(pinchRatio(hand(at, 'pinch', { roll }).landmarks, ASPECT)).toBeLessThan(0.3);
			for (const pose of ['open', 'point'] as const)
				expect(pinchRatio(hand(at, pose, { roll }).landmarks, ASPECT)).toBeGreaterThan(0.45);
		}
	});

	it('is deterministic for a seed, and noise stays small', () => {
		const a = hand([0.5, 0.5], 'open', { seed: 3, noise: 0.003 });
		expect(hand([0.5, 0.5], 'open', { seed: 3, noise: 0.003 })).toEqual(a);
		const still = hand([0.5, 0.5], 'open');
		const drift = a.landmarks.map((p, i) =>
			Math.hypot(p.x - still.landmarks[i].x, p.y - still.landmarks[i].y)
		);
		expect(Math.max(...drift)).toBeLessThan(0.02);
	});
});

describe('frames', () => {
	it('converts a MediaPipe result, keeping each hand with its own label', () => {
		const right = hand([0.3, 0.6], 'open', { label: 'Right' });
		const frame = toRawFrame(
			{
				landmarks: [right.landmarks],
				handedness: [[{ categoryName: 'Right', score: 0.97 }]]
			},
			ASPECT,
			12.5
		);
		expect(frame).toEqual({
			time: 12.5,
			aspect: ASPECT,
			hands: [{ landmarks: right.landmarks, label: 'Right', score: 0.97 }]
		});
	});

	it('round-trips a clip through JSON lines', () => {
		const clip = pinchDrag();
		const back = parseClip(serializeClip(clip));
		expect(back).toHaveLength(clip.length);
		expect(back[10].hands[0].landmarks[8].x).toBeCloseTo(clip[10].hands[0].landmarks[8].x, 4);
		expect(parseClip(serializeClip(back))).toEqual(back);
	});
});

describe('committed clips', () => {
	it('match what the builder makes', async () => {
		await expect(serializeClip(pinchDrag())).toMatchFileSnapshot('./fixtures/pinch-drag.jsonl');
		await expect(serializeClip(twoHands())).toMatchFileSnapshot('./fixtures/two-hands.jsonl');
	});
});

describe('replay', () => {
	it('turns a recorded pinch-drag into hover, one down, moves, one up', () => {
		const events = replay(parseClip(pinchDragText), createPipeline());
		const kinds = events.map((e) => e.event);
		expect(kinds.filter((k) => k === 'down')).toHaveLength(1);
		expect(kinds.filter((k) => k === 'up')).toHaveLength(1);
		expect(kinds.indexOf('down')).toBe(10);
		expect(kinds.indexOf('up')).toBe(22);
		const down = events[10].pointer!;
		const up = events[21].pointer!;
		expect(down.x - up.x).toBeGreaterThan(0.2);
	});

	it('gives identical events every time a clip is replayed', () => {
		for (const text of [pinchDragText, twoHandsText]) {
			const clip = parseClip(text);
			expect(replay(clip, createPipeline())).toEqual(replay(clip, createPipeline()));
		}
	});
});
