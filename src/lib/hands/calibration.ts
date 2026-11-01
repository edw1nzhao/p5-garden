import type { Measures, Shape } from './shapes.js';

export const CALIBRATED_SHAPES = ['fist', 'one', 'two', 'three', 'L', 'open'] as const;
export type CalibratedShape = (typeof CALIBRATED_SHAPES)[number];

/** One mean feature vector per shape: four finger extensions, then the thumb. */
export type Templates = Record<CalibratedShape, number[]>;

export const CALIBRATION_CONSTANTS = {
	/** Largest Euclidean distance to the nearest template that still counts as that shape. */
	maxDistance: 0.5,
	/** The nearest template must beat the runner-up by at least this much. */
	minSeparation: 0.05,
	/** A lead of this much over the runner-up counts as fully sure. */
	sureGap: 0.25,
	/** Templates closer together than this are too alike to tell apart reliably. */
	warnSeparation: 0.2
};

const LENGTH = 5;

export const featureVector = ({ fingers, thumb }: Measures): number[] => [...fingers, thumb];

export const templateDistance = (a: readonly number[], b: readonly number[]) =>
	Math.hypot(...a.map((v, i) => v - b[i]));
const distance = templateDistance;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Collects frames of one held shape and averages them into its template. */
export class TemplateBuilder {
	#sum = new Array<number>(LENGTH).fill(0);
	#count = 0;

	get count() {
		return this.#count;
	}

	add(measures: Measures) {
		featureVector(measures).forEach((v, i) => (this.#sum[i] += v));
		this.#count++;
	}

	mean(): number[] | null {
		return this.#count ? this.#sum.map((v) => v / this.#count) : null;
	}
}

export interface TemplateRead {
	shape: Shape;
	/** 0 to 1: how close to the nearest template and how clearly it beats the runner-up. */
	confidence: number;
}

export function classifyByTemplates(measures: Measures, templates: Templates): TemplateRead {
	const { maxDistance, minSeparation, sureGap } = CALIBRATION_CONSTANTS;
	const vector = featureVector(measures);
	const ranked = CALIBRATED_SHAPES.map((shape) => ({
		shape,
		d: distance(vector, templates[shape])
	})).sort((a, b) => a.d - b.d);
	const [best, next] = ranked;
	const gap = next.d - best.d;
	if (best.d > maxDistance || gap < minSeparation) return { shape: 'none', confidence: 0 };
	const confidence = Math.min(clamp01(1 - best.d / maxDistance), clamp01(gap / sureGap));
	return { shape: best.shape, confidence };
}

/** The two most alike templates and the distance between them. */
export function closestPair(templates: Templates): [CalibratedShape, CalibratedShape, number] {
	let best: [CalibratedShape, CalibratedShape, number] = ['fist', 'one', Infinity];
	CALIBRATED_SHAPES.forEach((a, i) =>
		CALIBRATED_SHAPES.slice(i + 1).forEach((b) => {
			const d = distance(templates[a], templates[b]);
			if (d < best[2]) best = [a, b, d];
		})
	);
	return best;
}

export const templateSeparation = (templates: Templates) => closestPair(templates)[2];

/** Templates read back from storage, or null when anything about them is off. */
export function parseTemplates(value: unknown): Templates | null {
	if (typeof value !== 'object' || value === null) return null;
	const record = value as Record<string, unknown>;
	const out: Partial<Templates> = {};
	for (const shape of CALIBRATED_SHAPES) {
		const v = record[shape];
		if (!Array.isArray(v) || v.length !== LENGTH) return null;
		if (!v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
		out[shape] = v as number[];
	}
	return out as Templates;
}
