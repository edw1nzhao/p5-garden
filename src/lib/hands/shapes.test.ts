import { describe, expect, it } from 'vitest';
import { pinchRatio } from './gesture.js';
import { Debounced, ShapeClassifier, type Shape } from './shapes.js';
import { hand, type Pose } from './synthetic.js';

const ASPECT = 4 / 3;
const POSES: [Pose, Shape][] = [
	['fist', 'fist'],
	['one', 'one'],
	['point', 'one'],
	['two', 'two'],
	['three', 'three'],
	['open', 'open'],
	['L', 'L'],
	['pinch', 'pinch']
];

/** What the pipeline hands the classifier: the landmarks and the pinch ratio's verdict. */
function classify(pose: Pose, options: Parameters<typeof hand>[2] = {}): Shape {
	const landmarks = hand([0.5, 0.55], pose, { aspect: ASPECT, ...options }).landmarks;
	const pinching = pinchRatio(landmarks, ASPECT) < 0.3;
	return new ShapeClassifier().read(landmarks, ASPECT, pinching).shape;
}

describe('ShapeClassifier', () => {
	for (const [pose, shape] of POSES) {
		it(`reads ${pose} as ${shape} at any roll, scale, label and with noise`, () => {
			for (const roll of [0, 45, 90, 180])
				for (const scale of [0.12, 0.3])
					for (const label of ['Left', 'Right'] as const)
						for (let seed = 1; seed <= 6; seed++)
							expect(
								classify(pose, { roll, scale, label, seed, noise: 0.003 }),
								`${roll} ${scale}`
							).toBe(shape);
		});
	}

	it('never reads a closed fist as a pinch, though its fingertips touch the thumb', () => {
		const landmarks = hand([0.5, 0.55], 'fist', { aspect: ASPECT }).landmarks;
		expect(pinchRatio(landmarks, ASPECT)).toBeLessThan(0.3);
		const read = new ShapeClassifier().read(landmarks, ASPECT, true);
		expect(read).toEqual({ shape: 'fist', pinching: false });
	});

	it('keeps a real pinch a pinch', () => {
		const landmarks = hand([0.5, 0.55], 'pinch', { aspect: ASPECT }).landmarks;
		expect(new ShapeClassifier().read(landmarks, ASPECT, true)).toEqual({
			shape: 'pinch',
			pinching: true
		});
	});

	it('tells one from L by the thumb, and three from open by the pinky', () => {
		expect(classify('one')).toBe('one');
		expect(classify('L')).toBe('L');
		expect(classify('three')).toBe('three');
		expect(classify('open')).toBe('open');
	});

	it('calls an unlisted combination none', () => {
		const open = hand([0.5, 0.5], 'open', { aspect: ASPECT }).landmarks;
		const fist = hand([0.5, 0.5], 'fist', { aspect: ASPECT }).landmarks;
		const ringOnly = fist.map((p, i) => (i >= 13 && i <= 16 ? open[i] : p));
		expect(new ShapeClassifier().read(ringOnly, ASPECT, false).shape).toBe('none');
	});

	it('holds a finger extended until it drops below the exit threshold', () => {
		const classifier = new ShapeClassifier();
		const open = hand([0.5, 0.5], 'open', { aspect: ASPECT }).landmarks;
		expect(classifier.read(open, ASPECT, false).shape).toBe('open');
		const half = hand([0.5, 0.5], 'open', { aspect: ASPECT }).landmarks.map((p, i, all) =>
			i >= 5 ? { ...p, y: all[0].y + (p.y - all[0].y) * 0.9 } : p
		);
		expect(classifier.read(half, ASPECT, false).shape).toBe('open');
	});
});

describe('Debounced', () => {
	const feed = (d: Debounced<string>, values: string[]) => values.map((v) => d.update(v));

	it('switches only after 5 consecutive frames of the new value', () => {
		const d = new Debounced('none', 5, 3);
		expect(feed(d, ['fist', 'fist', 'fist', 'fist', 'fist'])).toEqual([
			'none',
			'none',
			'none',
			'none',
			'fist'
		]);
	});

	it('releases to none after 3 frames that are not a stable alternative', () => {
		const d = new Debounced('none', 5, 3);
		feed(d, Array(5).fill('fist'));
		expect(feed(d, ['one', 'two', 'open'])).toEqual(['fist', 'fist', 'none']);
	});

	it('moves straight from one shape to another after 5 frames', () => {
		const d = new Debounced('none', 5, 3);
		feed(d, Array(5).fill('fist'));
		const out = feed(d, Array(5).fill('open'));
		expect(out[2]).toBe('none');
		expect(out[4]).toBe('open');
	});

	it('ignores flicker of one or two frames', () => {
		const d = new Debounced('none', 5, 3);
		feed(d, Array(5).fill('fist'));
		const seen = feed(d, ['open', 'fist', 'open', 'open', 'fist', 'two', 'fist']);
		expect(new Set(seen)).toEqual(new Set(['fist']));
		feed(d, ['one', 'one', 'fist', 'one', 'one', 'fist']);
		expect(d.update('fist')).toBe('fist');
	});

	it('does not release a settled none because of flicker either', () => {
		const d = new Debounced('none', 5, 3);
		expect(feed(d, ['fist', 'fist', 'none', 'fist', 'fist', 'fist'])).not.toContain('fist');
	});
});
