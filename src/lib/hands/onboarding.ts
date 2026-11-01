import {
	CALIBRATED_SHAPES,
	CALIBRATION_CONSTANTS,
	closestPair,
	TemplateBuilder,
	type CalibratedShape,
	type Templates
} from './calibration.js';
import type { Handedness } from './frames.js';
import type { HandReading } from './pipeline.js';

export const GUIDE_CONSTANTS = {
	/** How long a lone hand must keep one label before it counts as the user's right hand. */
	handHoldMs: 1000,
	minScore: 0.7,
	/** Time given to change shape before frames count towards a template. */
	settleMs: 400,
	/** Steady time collected per shape. */
	shapeHoldMs: 1500,
	/** Fewest frames a template may be built from. */
	minFrames: 15,
	/** Wrist speed, in frame widths per second, below which the hand counts as steady. */
	steadySpeed: 0.25,
	/** A longer gap between frames is a dropout and is not counted. */
	maxGapMs: 150,
	frameAspect: 4 / 3
};

export type Step = 'hand' | 'pinch' | 'calibrate' | 'done';
const STEPS: Step[] = ['hand', 'pinch', 'calibrate', 'done'];

export interface GuideInput {
	time: number;
	/** MediaPipe's own label and score for every hand in the frame. */
	raw: { label: Handedness; score: number }[];
	drawing: HandReading | null;
	off: HandReading | null;
}

export type GuideEffect = { type: 'labelsInverted'; value: boolean };

export interface GuideState {
	step: Step;
	hand: { progress: number; detected: Handedness | null };
	pinched: boolean;
	calibrate: {
		shape: CalibratedShape | null;
		progress: number;
		done: CalibratedShape[];
		/** All six templates, once every shape is held. */
		templates: Templates | null;
		warning: string | null;
	};
	/** Plain-language progress for the live region. */
	status: string;
}

const NAMES: Record<CalibratedShape, string> = {
	fist: 'a fist',
	one: 'one finger up',
	two: 'two fingers up',
	three: 'three fingers up',
	L: 'an L shape',
	open: 'an open hand'
};

/** The first-use guide as a pure state machine over tracker frames. */
export class Guide {
	#c = GUIDE_CONSTANTS;
	#step: Step;
	#lone: { label: Handedness; since: number } | null = null;
	#handProgress = 0;
	#detected: Handedness | null = null;
	#pinched = false;
	#templates: Partial<Templates> = {};
	#current: CalibratedShape | null = CALIBRATED_SHAPES[0];
	#builder = new TemplateBuilder();
	#held = 0;
	#readyAt: number | null = null;
	#prev: { x: number; y: number; t: number } | null = null;

	constructor(start: Step = 'hand') {
		this.#step = start;
	}

	get state(): GuideState {
		const done = CALIBRATED_SHAPES.filter((s) => this.#templates[s]);
		const templates =
			done.length === CALIBRATED_SHAPES.length ? (this.#templates as Templates) : null;
		const warning = templates ? this.#warning(templates) : null;
		const progress = Math.min(1, this.#held / this.#c.shapeHoldMs);
		return {
			step: this.#step,
			hand: { progress: this.#handProgress, detected: this.#detected },
			pinched: this.#pinched,
			calibrate: { shape: this.#current, progress, done, templates, warning },
			status: this.#status(done.length, progress, warning)
		};
	}

	feed(input: GuideInput): GuideEffect[] {
		if (this.#step === 'hand') return this.#feedHand(input);
		if (this.#step === 'pinch') this.#pinched ||= !!input.drawing?.pinching;
		else if (this.#step === 'calibrate') this.#feedCalibration(input);
		return [];
	}

	next() {
		this.#step = STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(this.#step) + 1)];
		this.#prev = null;
		this.#readyAt = null;
	}

	retry(shape: CalibratedShape) {
		delete this.#templates[shape];
		this.#begin(shape);
	}

	#begin(shape: CalibratedShape) {
		this.#current = shape;
		this.#builder = new TemplateBuilder();
		this.#held = 0;
		this.#readyAt = null;
		this.#prev = null;
	}

	#feedHand({ time, raw }: GuideInput): GuideEffect[] {
		if (this.#detected) return [];
		const only = raw.length === 1 && raw[0].score >= this.#c.minScore ? raw[0].label : null;
		if (!only) {
			this.#lone = null;
			this.#handProgress = 0;
			return [];
		}
		if (this.#lone?.label !== only) this.#lone = { label: only, since: time };
		this.#handProgress = Math.min(1, (time - this.#lone.since) / this.#c.handHoldMs);
		if (this.#handProgress < 1) return [];
		this.#detected = only;
		return [{ type: 'labelsInverted', value: only === 'Left' }];
	}

	#feedCalibration({ time, off }: GuideInput) {
		const shape = this.#current;
		if (!shape || !off) {
			this.#prev = null;
			return;
		}
		this.#readyAt ??= time + this.#c.settleMs;
		const prev = this.#prev;
		this.#prev = { ...off.wrist, t: time };
		if (!prev || time < this.#readyAt) return;
		const dt = time - prev.t;
		if (dt <= 0 || dt > this.#c.maxGapMs) return;
		const moved = Math.hypot(off.wrist.x - prev.x, (off.wrist.y - prev.y) / this.#c.frameAspect);
		if ((moved / dt) * 1000 > this.#c.steadySpeed) return;
		this.#builder.add(off.measures);
		this.#held += dt;
		if (this.#held < this.#c.shapeHoldMs || this.#builder.count < this.#c.minFrames) return;
		this.#templates[shape] = this.#builder.mean()!;
		const nextShape = CALIBRATED_SHAPES.find((s) => !this.#templates[s]) ?? null;
		if (nextShape) this.#begin(nextShape);
		else {
			this.#current = null;
			this.#held = this.#c.shapeHoldMs;
		}
	}

	#warning(templates: Templates): string | null {
		const [a, b, distance] = closestPair(templates);
		return distance < CALIBRATION_CONSTANTS.warnSeparation
			? `${a} and ${b} look too alike. Redo one of them, holding the shapes more differently.`
			: null;
	}

	#status(doneCount: number, progress: number, warning: string | null): string {
		switch (this.#step) {
			case 'hand':
				return this.#detected
					? `Got it. Your right hand is read as ${this.#detected}.`
					: this.#handProgress > 0
						? 'Hold still, reading your hand.'
						: 'Raise your right hand only, palm to the camera.';
			case 'pinch':
				return this.#pinched
					? 'Pinch detected. You are ready to paint.'
					: 'Pinch your thumb and index finger together with your drawing hand to paint.';
			case 'calibrate':
				if (!this.#current) return warning ?? 'All six shapes captured. Finish to keep them.';
				return `Hold ${NAMES[this.#current]} with your off hand, steady. Shape ${doneCount + 1} of ${CALIBRATED_SHAPES.length}, ${Math.round(progress * 100)} percent.`;
			default:
				return 'All set. Here is what each gesture does.';
		}
	}
}
