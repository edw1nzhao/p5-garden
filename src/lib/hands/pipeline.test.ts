import { describe, expect, it } from 'vitest';
import type { Handedness, RawFrame } from './frames.js';
import { createPipeline } from './pipeline.js';
import { hand, type Pose } from './synthetic.js';

const ASPECT = 4 / 3;
const frame = (i: number, hands: ReturnType<typeof hand>[]): RawFrame => ({
	time: (i * 1000) / 30,
	aspect: ASPECT,
	hands
});
const at = (x: number, pose: Pose, label: Handedness) =>
	hand([x, 0.7], pose, { aspect: ASPECT, label });

describe('pipeline with both hands', () => {
	it('reports each hand in its own role with its own shape and wrist', () => {
		const pipeline = createPipeline();
		let out = pipeline(frame(0, []));
		for (let i = 0; i < 8; i++)
			out = pipeline(frame(i, [at(0.3, 'pinch', 'Right'), at(0.7, 'fist', 'Left')]));
		expect(out.drawing).toMatchObject({ shape: 'pinch', pinching: true });
		expect(out.off).toMatchObject({ shape: 'fist', pinching: false });
		expect(out.drawing!.wrist.x).toBeCloseTo(0.7, 1);
		expect(out.off!.wrist.x).toBeCloseTo(0.3, 1);
		expect(out.drawing!.id).not.toBe(out.off!.id);
		expect(out.off!.openness).toBeLessThan(0.2);
	});

	it('reads a fist as a fist and never a pinch, even though the fingertips meet the thumb', () => {
		const pipeline = createPipeline();
		const shapes = Array.from(
			{ length: 10 },
			(_, i) => pipeline(frame(i, [at(0.3, 'fist', 'Right')])).drawing
		);
		expect(shapes.every((s) => !s!.pinching)).toBe(true);
		expect(shapes.at(-1)!.shape).toBe('fist');
	});

	it('debounces the shape: five frames to switch, three to let go', () => {
		const pipeline = createPipeline();
		const shapeAt = (i: number, pose: Pose) =>
			pipeline(frame(i, [at(0.3, pose, 'Right')])).drawing!.shape;
		const first = Array.from({ length: 6 }, (_, i) => shapeAt(i, 'two'));
		expect(first).toEqual(['none', 'none', 'none', 'none', 'two', 'two']);
		const next = Array.from({ length: 5 }, (_, i) => shapeAt(6 + i, 'open'));
		expect(next).toEqual(['two', 'two', 'none', 'none', 'open']);
	});

	it('starts no new pinch in either slot while the wrists overlap', () => {
		const pipeline = createPipeline();
		const run = (i: number, pose: Pose) =>
			pipeline(frame(i, [at(0.3, pose, 'Right'), at(0.36, pose, 'Left')]));
		for (let i = 0; i < 2; i++) run(i, 'open');
		const out = run(2, 'pinch');
		expect(out.crossing).toBe(true);
		expect(out.drawing!.pinching).toBe(false);
		expect(out.off!.pinching).toBe(false);
	});

	it('smooths the off hand pointer separately from the drawing hand', () => {
		const pipeline = createPipeline();
		const xs: number[] = [];
		for (let i = 0; i < 12; i++) {
			const out = pipeline(
				frame(i, [at(0.3, 'open', 'Right'), at(i < 6 ? 0.7 : 0.8, 'open', 'Left')])
			);
			xs.push(out.off!.pointer.x);
		}
		const target = createPipeline()(frame(0, [at(0.3, 'open', 'Right'), at(0.8, 'open', 'Left')]))
			.off!.pointer.x;
		expect(xs[6]).toBeLessThan(xs[5]);
		expect(xs[6]).toBeGreaterThan(target);
	});

	it('honours the drawing hand setting', () => {
		const pipeline = createPipeline({ drawingHand: 'Left' });
		let out = pipeline(frame(0, []));
		for (let i = 0; i < 3; i++)
			out = pipeline(frame(i, [at(0.7, 'open', 'Left'), at(0.3, 'open', 'Right')]));
		expect(out.drawing!.wrist.x).toBeCloseTo(1 - 0.7, 1);
	});
});
