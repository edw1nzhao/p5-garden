import {
	CALIBRATED_SHAPES,
	CALIBRATION_CONSTANTS,
	closestPair,
	templateDistance,
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
	/** How long a success beat stays on screen before the guide moves on by itself. */
	successMs: 1200,
	/** The off hand must stay steady this long before the countdown starts. */
	presentMs: 400,
	/** Countdown shown while the user forms the shape, split evenly over 3, 2, 1. */
	countdownMs: 2400,
	/** Steady time collected per shape. */
	shapeHoldMs: 1500,
	/** The "Got it" beat after a shape is captured. */
	confirmMs: 1200,
	/** How long the "looked like your other shape" message shows before the redo. */
	retryMs: 1500,
	/** Automatic redos of one shape before its template is accepted anyway. */
	maxRedos: 2,
	/** A new template closer than this to another shape's template is a likely mix-up. */
	confusableDistance: CALIBRATION_CONSTANTS.warnSeparation,
	/** Fewest frames a template may be built from. */
	minFrames: 15,
	/** Wrist speed, in frame widths per second, below which the hand counts as steady. */
	steadySpeed: 0.25,
	/** Faster than this during the countdown sends the guide back to waiting. */
	countdownAbortSpeed: 0.8,
	/** A longer gap between frames is a dropout and is not counted. */
	maxGapMs: 150,
	/** An off hand missing this long during capture sends the guide back to waiting. */
	dropoutResetMs: 1000,
	/** The finished card closes itself after this long unless it is hovered or focused. */
	doneCloseMs: 4000,
	frameAspect: 4 / 3
};

export type Step = 'hand' | 'pinch' | 'calibrate' | 'done';
const STEPS: Step[] = ['hand', 'pinch', 'calibrate', 'done'];

export type CalibratePhase = 'waiting' | 'countdown' | 'capturing' | 'confirm' | 'retry';

export interface GuideInput {
	time: number;
	/** MediaPipe's own label and score for every hand in the frame. */
	raw: { label: Handedness; score: number }[];
	drawing: HandReading | null;
	off: HandReading | null;
}

export type GuideEffect =
	| { type: 'labelsInverted'; value: boolean }
	| { type: 'calibrated'; templates: Templates }
	| { type: 'close' };

export interface GuideState {
	step: Step;
	hand: { progress: number; detected: Handedness | null };
	pinched: boolean;
	calibrate: {
		shape: CalibratedShape | null;
		phase: CalibratePhase;
		/** 3, 2 or 1 during the countdown, otherwise null. */
		countdown: number | null;
		progress: number;
		done: CalibratedShape[];
		/** All six templates, once every shape is held. */
		templates: Templates | null;
		/** Set while the retry message shows: the shape the last attempt resembled. */
		confusedWith: CalibratedShape | null;
		/** Shapes accepted after the redo cap although they resembled another shape. */
		lowConfidence: CalibratedShape[];
		warning: string | null;
	};
	/** Plain-language progress for the live region. */
	status: string;
}

export const SHAPE_NAMES: Record<CalibratedShape, string> = {
	fist: 'a fist',
	one: 'one finger up',
	two: 'two fingers up',
	three: 'three fingers up',
	L: 'an L shape',
	open: 'an open hand'
};

/** The first-use guide as a pure state machine over tracker frames and clock ticks. */
export class Guide {
	#c = GUIDE_CONSTANTS;
	#step: Step;
	#now = 0;
	#lone: { label: Handedness; since: number } | null = null;
	#handProgress = 0;
	#detected: Handedness | null = null;
	#pinched = false;
	#successAt: number | null = null;
	#templates: Partial<Templates> = {};
	#current: CalibratedShape | null = CALIBRATED_SHAPES[0];
	#phase: CalibratePhase = 'waiting';
	#phaseAt = 0;
	#steadySince: number | null = null;
	#lastSeen = 0;
	#confusedWith: CalibratedShape | null = null;
	#redos = 0;
	#lowConfidence = new Set<CalibratedShape>();
	#builder = new TemplateBuilder();
	#held = 0;
	#prev: { x: number; y: number; t: number } | null = null;
	#doneAt: number | null = null;
	#holdClose = false;
	#closed = false;

	constructor(start: Step = 'hand') {
		this.#step = start;
	}

	get state(): GuideState {
		const done = CALIBRATED_SHAPES.filter((s) => this.#templates[s]);
		const templates =
			done.length === CALIBRATED_SHAPES.length ? (this.#templates as Templates) : null;
		const warning = templates ? this.#warning(templates) : null;
		const progress = Math.min(1, this.#held / this.#c.shapeHoldMs);
		const countdown = this.#phase === 'countdown' ? this.#countdownNumber() : null;
		return {
			step: this.#step,
			hand: { progress: this.#handProgress, detected: this.#detected },
			pinched: this.#pinched,
			calibrate: {
				shape: this.#current,
				phase: this.#phase,
				countdown,
				progress,
				done,
				templates,
				confusedWith: this.#phase === 'retry' ? this.#confusedWith : null,
				lowConfidence: [...this.#lowConfidence],
				warning
			},
			status: this.#status(done.length, progress, countdown, warning)
		};
	}

	feed(input: GuideInput): GuideEffect[] {
		const effects = this.tick(input.time);
		if (this.#step === 'hand') effects.push(...this.#feedHand(input));
		else if (this.#step === 'pinch') this.#feedPinch(input);
		else if (this.#step === 'calibrate') this.#feedCalibration(input);
		return effects;
	}

	/** Advances everything that waits on the clock; call it between frames as well. */
	tick(time: number): GuideEffect[] {
		this.#now = time;
		const effects: GuideEffect[] = [];
		if (this.#successAt !== null && time >= this.#successAt) this.next();
		if (this.#step === 'calibrate') effects.push(...this.#tickCalibration(time));
		if (this.#step === 'done' && !this.#closed && !this.#holdClose) {
			this.#doneAt ??= time;
			if (time - this.#doneAt >= this.#c.doneCloseMs) {
				this.#closed = true;
				effects.push({ type: 'close' });
			}
		}
		return effects;
	}

	next() {
		this.#step = STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(this.#step) + 1)];
		this.#successAt = null;
		this.#prev = null;
		if (this.#step === 'calibrate') this.#begin(this.#current ?? CALIBRATED_SHAPES[0]);
		if (this.#step === 'done') this.#current = null;
	}

	/** Pointer over the card or focus inside it cancels the automatic close for good. */
	hold(active: boolean) {
		if (active) this.#holdClose = true;
	}

	/** Goes back to the most recent shape that was captured and captures it again. */
	redoPrevious() {
		if (this.#step !== 'calibrate') return;
		const last = CALIBRATED_SHAPES.filter((s) => this.#templates[s]).at(-1);
		if (!last) return;
		delete this.#templates[last];
		this.#lowConfidence.delete(last);
		this.#redos = 0;
		this.#begin(last);
	}

	#begin(shape: CalibratedShape) {
		this.#current = shape;
		this.#builder = new TemplateBuilder();
		this.#held = 0;
		this.#prev = null;
		this.#steadySince = null;
		this.#confusedWith = null;
		this.#phase = 'waiting';
		this.#phaseAt = this.#now;
	}

	#enter(phase: CalibratePhase, time: number) {
		this.#phase = phase;
		this.#phaseAt = time;
	}

	#countdownNumber() {
		const slice = this.#c.countdownMs / 3;
		const left = Math.ceil((this.#c.countdownMs - (this.#now - this.#phaseAt)) / slice);
		return Math.min(3, Math.max(1, left));
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
		this.#successAt = time + this.#c.successMs;
		return [{ type: 'labelsInverted', value: only === 'Left' }];
	}

	#feedPinch({ time, drawing }: GuideInput) {
		if (this.#pinched || !drawing?.pinching) return;
		this.#pinched = true;
		this.#successAt = time + this.#c.successMs;
	}

	/** Wrist speed in frame widths per second and the gap since the last frame, if usable. */
	#motion(off: HandReading, time: number): { speed: number; dt: number } | null {
		const prev = this.#prev;
		this.#prev = { ...off.wrist, t: time };
		if (!prev) return null;
		const dt = time - prev.t;
		if (dt <= 0 || dt > this.#c.maxGapMs) return null;
		const moved = Math.hypot(off.wrist.x - prev.x, (off.wrist.y - prev.y) / this.#c.frameAspect);
		return { speed: (moved / dt) * 1000, dt };
	}

	#feedCalibration({ time, off }: GuideInput) {
		if (
			!this.#current ||
			(this.#phase !== 'waiting' && this.#phase !== 'countdown' && this.#phase !== 'capturing')
		)
			return;
		if (!off) {
			this.#prev = null;
			this.#steadySince = null;
			if (this.#phase === 'countdown') this.#enter('waiting', time);
			return;
		}
		this.#lastSeen = time;
		const motion = this.#motion(off, time);
		if (this.#phase === 'waiting') {
			if (motion && motion.speed > this.#c.steadySpeed) this.#steadySince = null;
			else this.#steadySince ??= time;
			if (time - (this.#steadySince ?? time) >= this.#c.presentMs) this.#enter('countdown', time);
		} else if (this.#phase === 'countdown') {
			if (motion && motion.speed > this.#c.countdownAbortSpeed) this.#restart(time);
		} else if (motion && motion.speed <= this.#c.steadySpeed) {
			this.#builder.add(off.measures);
			this.#held += motion.dt;
			this.#finishCapture(time);
		}
	}

	#restart(time: number) {
		this.#enter('waiting', time);
		this.#steadySince = null;
		this.#prev = null;
	}

	#tickCalibration(time: number): GuideEffect[] {
		const c = this.#c;
		const elapsed = time - this.#phaseAt;
		switch (this.#phase) {
			case 'countdown':
				if (elapsed >= c.countdownMs) {
					this.#enter('capturing', time);
					this.#prev = null;
					this.#held = 0;
					this.#builder = new TemplateBuilder();
					this.#lastSeen = time;
				}
				break;
			case 'capturing':
				if (time - this.#lastSeen > c.dropoutResetMs) this.#restart(time);
				break;
			case 'retry':
				if (elapsed >= c.retryMs && this.#current) this.#begin(this.#current);
				break;
			case 'confirm':
				if (elapsed < c.confirmMs) break;
				return this.#advanceShape();
		}
		return [];
	}

	#finishCapture(time: number) {
		const shape = this.#current;
		if (!shape || this.#held < this.#c.shapeHoldMs || this.#builder.count < this.#c.minFrames) {
			return;
		}
		const template = this.#builder.mean()!;
		let clash: CalibratedShape | null = null;
		let nearest = this.#c.confusableDistance;
		for (const other of CALIBRATED_SHAPES) {
			const known = this.#templates[other];
			if (other === shape || !known) continue;
			const d = templateDistance(template, known);
			if (d < nearest) [clash, nearest] = [other, d];
		}
		if (clash && this.#redos < this.#c.maxRedos) {
			this.#redos++;
			this.#confusedWith = clash;
			this.#enter('retry', time);
			return;
		}
		if (clash) this.#lowConfidence.add(shape);
		this.#templates[shape] = template;
		this.#enter('confirm', time);
	}

	#advanceShape(): GuideEffect[] {
		const nextShape = CALIBRATED_SHAPES.find((s) => !this.#templates[s]);
		this.#redos = 0;
		if (nextShape) {
			this.#begin(nextShape);
			return [];
		}
		this.next();
		return [{ type: 'calibrated', templates: this.#templates as Templates }];
	}

	#warning(templates: Templates): string | null {
		const [a, b, distance] = closestPair(templates);
		return distance < CALIBRATION_CONSTANTS.warnSeparation
			? `${a} and ${b} look too alike. Redo one of them, holding the shapes more differently.`
			: null;
	}

	#status(doneCount: number, progress: number, countdown: number | null, warning: string | null) {
		switch (this.#step) {
			case 'hand':
				return this.#detected
					? 'Got it. Your drawing hand is Right.'
					: this.#handProgress > 0
						? 'Hold still, reading your hand.'
						: 'Raise your right hand only, palm to the camera.';
			case 'pinch':
				return this.#pinched
					? 'Pinch detected. You are ready to paint.'
					: 'Pinch your thumb and index finger together with your drawing hand to paint.';
			case 'calibrate':
				return this.#calibrationStatus(doneCount, progress, countdown);
			default:
				return warning
					? `All set. ${warning}`
					: 'All set. Here is what each gesture does. This closes by itself.';
		}
	}

	#calibrationStatus(doneCount: number, progress: number, countdown: number | null) {
		const shape = this.#current;
		if (!shape) return '';
		const n = `Shape ${doneCount + (this.#phase === 'confirm' ? 0 : 1)} of ${CALIBRATED_SHAPES.length}`;
		switch (this.#phase) {
			case 'waiting':
				return `Show your other hand. ${n}: ${SHAPE_NAMES[shape]}.`;
			case 'countdown':
				return `Make ${SHAPE_NAMES[shape]} with your other hand. ${countdown}.`;
			case 'capturing':
				return `Hold it steady. ${Math.round(progress * 100)} percent.`;
			case 'confirm':
				return `Got it. ${n} captured.`;
			case 'retry':
				return `That looked like ${this.#confusedWith ? SHAPE_NAMES[this.#confusedWith] : 'another shape'}. Let's try again.`;
		}
	}
}
