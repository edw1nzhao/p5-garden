import { describe, expect, it } from 'vitest';
import type { Landmark } from './gesture.js';
import {
	CALIBRATED_SHAPES,
	CALIBRATION_CONSTANTS,
	classifyByTemplates,
	parseTemplates,
	TemplateBuilder,
	templateSeparation,
	type CalibratedShape,
	type Templates
} from './calibration.js';
import { measure, ShapeClassifier } from './shapes.js';
import { hand } from './synthetic.js';

const ASPECT = 4 / 3;
const INDEX_MCP = 5;
const THUMB_TIP = 4;

/** A user whose thumb sits `k` times as far from the index knuckle as the average hand's. */
function withThumb(landmarks: Landmark[], k: number): Landmark[] {
	const base = landmarks[INDEX_MCP];
	const tip = landmarks[THUMB_TIP];
	const moved = {
		x: base.x + (tip.x - base.x) * k,
		y: base.y + (tip.y - base.y) * k,
		z: base.z + (tip.z - base.z) * k
	};
	return landmarks.map((p, i) => (i === THUMB_TIP ? moved : p));
}

function landmarksOf(shape: CalibratedShape, thumb: number, options = {}) {
	return withThumb(hand([0.5, 0.55], shape, { aspect: ASPECT, ...options }).landmarks, thumb);
}

function calibrate(thumb = 1): Templates {
	return Object.fromEntries(
		CALIBRATED_SHAPES.map((shape) => {
			const builder = new TemplateBuilder();
			for (let seed = 1; seed <= 30; seed++)
				builder.add(
					measure(landmarksOf(shape, thumb, { seed, noise: 0.003, roll: seed * 7 }), ASPECT)
				);
			return [shape, builder.mean()!];
		})
	) as Templates;
}

const read = (templates: Templates | null, landmarks: Landmark[]) =>
	new ShapeClassifier(templates).read(landmarks, ASPECT, false);

describe('TemplateBuilder', () => {
	it('averages the feature vectors it is given', () => {
		const builder = new TemplateBuilder();
		expect(builder.mean()).toBeNull();
		builder.add({ fingers: [1, 1, 1, 1], thumb: 0 });
		builder.add({ fingers: [0, 0.5, 1, 1.5], thumb: 1 });
		expect(builder.count).toBe(2);
		expect(builder.mean()).toEqual([0.5, 0.75, 1, 1.25, 0.5]);
	});
});

describe('template classification', () => {
	const templates = calibrate();

	it.each(CALIBRATED_SHAPES)('reads noisy %s at any roll, scale and label', (shape) => {
		for (const roll of [0, 45, 90, 180])
			for (const scale of [0.12, 0.3])
				for (const label of ['Left', 'Right'] as const)
					for (let seed = 40; seed < 46; seed++) {
						const landmarks = landmarksOf(shape, 1, { roll, scale, label, seed, noise: 0.002 });
						expect(read(templates, landmarks).shape, `${roll} ${scale}`).toBe(shape);
					}
	});

	it('learns a hand with unusual proportions that the rules misread', () => {
		const long = (shape: CalibratedShape, seed = 1) => landmarksOf(shape, 2.1, { seed });
		expect(read(null, long('one')).shape).toBe('L');
		const mine = calibrate(2.1);
		for (const shape of CALIBRATED_SHAPES) expect(read(mine, long(shape, 9)).shape).toBe(shape);
	});

	it('returns none for a vector between two templates', () => {
		const a = templates.one;
		const b = templates.two;
		const middle = a.map((v, i) => (v + b[i]) / 2);
		const out = classifyByTemplates({ fingers: middle.slice(0, 4), thumb: middle[4] }, templates);
		expect(out.shape).toBe('none');
		expect(out.confidence).toBeLessThan(0.3);
	});

	it('returns none for a vector far from every template', () => {
		const out = classifyByTemplates({ fingers: [2.4, 2.4, 2.4, 2.4], thumb: 2 }, templates);
		expect(out.shape).toBe('none');
		expect(out.confidence).toBe(0);
	});

	it('is more confident the closer the hand is to a template', () => {
		const exact = classifyByTemplates(
			{ fingers: templates.fist.slice(0, 4), thumb: templates.fist[4] },
			templates
		);
		const off = classifyByTemplates(
			{ fingers: templates.fist.slice(0, 4).map((v) => v + 0.2), thumb: templates.fist[4] },
			templates
		);
		expect(exact.shape).toBe('fist');
		expect(exact.confidence).toBeGreaterThan(0.8);
		expect(off.confidence).toBeLessThan(exact.confidence);
		expect(off.confidence).toBeGreaterThan(0);
	});

	it('keeps pinch priority and the index-tuck fist veto', () => {
		const pinch = hand([0.5, 0.55], 'pinch', { aspect: ASPECT }).landmarks;
		expect(new ShapeClassifier(templates).read(pinch, ASPECT, true)).toMatchObject({
			shape: 'pinch',
			pinching: true
		});
		const fist = hand([0.5, 0.55], 'fist', { aspect: ASPECT }).landmarks;
		expect(new ShapeClassifier(templates).read(fist, ASPECT, true).shape).toBe('fist');
	});

	it('reports a confidence from the rules too', () => {
		const sure = read(null, landmarksOf('open', 1));
		expect(sure.confidence).toBeGreaterThan(0.5);
		expect(sure.confidence).toBeLessThanOrEqual(1);
	});
});

describe('template storage', () => {
	it('round-trips through JSON and rejects anything malformed', () => {
		const templates = calibrate();
		expect(parseTemplates(JSON.parse(JSON.stringify(templates)))).toEqual(templates);
		expect(parseTemplates(null)).toBeNull();
		expect(parseTemplates({ ...templates, fist: [1, 2] })).toBeNull();
		expect(parseTemplates({ ...templates, open: [1, 1, 1, 1, NaN] })).toBeNull();
		expect(parseTemplates({ fist: templates.fist })).toBeNull();
	});

	it('measures how far apart the closest two shapes are', () => {
		expect(templateSeparation(calibrate())).toBeGreaterThan(
			CALIBRATION_CONSTANTS.minSeparation * 2
		);
		const same = { ...calibrate() };
		same.one = [...same.two];
		expect(templateSeparation(same)).toBe(0);
	});
});
