import type { Landmark } from './gesture.js';

export type Shape = 'pinch' | 'fist' | 'one' | 'two' | 'three' | 'open' | 'L' | 'none';

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
// Wrist-to-tip over wrist-to-PIP: a straight finger reads about 1.3, a curled one under 0.8.
const EXTEND_ENTER = 1.15;
const EXTEND_EXIT = 1.0;
// Thumb tip to index knuckle over hand size; separate thresholds stop flicker.
const THUMB_ENTER = 0.7;
const THUMB_EXIT = 0.55;
// Middle, ring and pinky all below this are a closed fist, never a pinch.
const FIST_TIGHT = 0.85;
// Mean finger extension mapped onto 0 (curled) to 1 (straight).
const OPEN_MIN = 0.7;
const OPEN_MAX = 1.3;

/** Tip and PIP landmark indices for index, middle, ring and pinky. */
const FINGERS = [
	[8, 6],
	[12, 10],
	[16, 14],
	[20, 18]
] as const;

/** Landmark x is a share of frame width, y of height, and z shares x's scale. */
const dist = (a: Landmark, b: Landmark, aspect: number) =>
	Math.hypot((a.x - b.x) * aspect, a.y - b.y, (a.z - b.z) * aspect);

export interface Measures {
	/** Wrist-to-tip over wrist-to-PIP for index, middle, ring and pinky. */
	fingers: number[];
	/** Thumb tip to index knuckle, in hand sizes. */
	thumb: number;
}

export function measure(landmarks: readonly Landmark[], aspect: number): Measures {
	const wrist = landmarks[WRIST];
	const size = dist(wrist, landmarks[MIDDLE_MCP], aspect) || 1;
	return {
		fingers: FINGERS.map(
			([tip, pip]) =>
				dist(wrist, landmarks[tip], aspect) / (dist(wrist, landmarks[pip], aspect) || 1)
		),
		thumb: dist(landmarks[THUMB_TIP], landmarks[INDEX_MCP], aspect) / size
	};
}

/** How open the hand is: 0 for a closed fist, 1 for straight fingers. */
export function openness({ fingers }: Measures): number {
	const mean = fingers.reduce((sum, f) => sum + f, 0) / fingers.length;
	return Math.min(1, Math.max(0, (mean - OPEN_MIN) / (OPEN_MAX - OPEN_MIN)));
}

export interface ShapeRead {
	shape: Shape;
	pinching: boolean;
}

/** Reads one hand's shape frame by frame, keeping each finger's extended state for hysteresis. */
export class ShapeClassifier {
	#extended = [false, false, false, false];
	#thumbOut = false;

	/** `pinching` is the pinch ratio's verdict; a closed fist overrules it. */
	read(landmarks: readonly Landmark[], aspect: number, pinching: boolean): ShapeRead {
		const m = measure(landmarks, aspect);
		this.#extended = m.fingers.map((f, i) => f > (this.#extended[i] ? EXTEND_EXIT : EXTEND_ENTER));
		this.#thumbOut = m.thumb > (this.#thumbOut ? THUMB_EXIT : THUMB_ENTER);
		const closedFist = !this.#extended[0] && m.fingers.slice(1).every((f) => f < FIST_TIGHT);
		if (pinching && !closedFist) return { shape: 'pinch', pinching: true };
		return { shape: shapeOf(this.#extended, this.#thumbOut), pinching: false };
	}
}

function shapeOf(extended: boolean[], thumbOut: boolean): Shape {
	const [index, middle, ring, pinky] = extended;
	const count = extended.filter(Boolean).length;
	if (count === 0) return 'fist';
	if (count === 4) return 'open';
	if (!index) return 'none';
	if (count === 1) return thumbOut ? 'L' : 'one';
	if (count === 2 && middle) return 'two';
	if (count === 3 && middle && ring && !pinky) return 'three';
	return 'none';
}

/** Switches to a new value after `enter` frames in a row, and drops to `rest` after `exit` frames of anything else. */
export class Debounced<T> {
	#rest: T;
	#enter: number;
	#exit: number;
	#value: T;
	#candidate: T;
	#seen = 0;
	#away = 0;

	constructor(rest: T, enter = 5, exit = 3) {
		this.#rest = rest;
		this.#enter = enter;
		this.#exit = exit;
		this.#value = this.#candidate = rest;
	}

	update(next: T): T {
		if (next === this.#value) {
			this.#seen = this.#away = 0;
			this.#candidate = next;
			return this.#value;
		}
		this.#seen = next === this.#candidate ? this.#seen + 1 : 1;
		this.#candidate = next;
		this.#away++;
		if (this.#seen >= this.#enter) {
			this.#value = next;
			this.#seen = this.#away = 0;
		} else if (this.#away >= this.#exit) {
			this.#value = this.#rest;
		}
		return this.#value;
	}

	reset() {
		this.#value = this.#candidate = this.#rest;
		this.#seen = this.#away = 0;
	}
}
