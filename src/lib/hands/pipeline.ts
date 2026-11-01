import { isPinching, pinchRatio, pointerOf, type HandState } from './gesture.js';
import type { RawFrame } from './frames.js';
import { OneEuro, type OneEuroOptions } from './filter.js';
import { HandSlots, type SlotOptions, type TrackedHand } from './identity.js';
import { Debounced, measure, openness, ShapeClassifier, type Shape } from './shapes.js';

/** One tracked hand, after smoothing. Positions are mirrored canvas fractions. */
export interface HandReading extends HandState {
	id: number;
	shape: Shape;
	wrist: { x: number; y: number };
	/** 0 for a closed fist, 1 for straight fingers. */
	openness: number;
}

export interface HandsState {
	drawing: HandReading | null;
	off: HandReading | null;
	/** The wrists are so close that roles are frozen and no new pinch starts. */
	crossing: boolean;
}

export type Pipeline = (frame: RawFrame) => HandsState;

export interface PipelineOptions extends SlotOptions {
	pointerFilter?: OneEuroOptions;
	pinchFilter?: OneEuroOptions;
}

export const NO_HANDS: HandsState = { drawing: null, off: null, crossing: false };

// The pointer is filtered in pixels of a nominal 640-wide frame, the units beta is tuned in.
const PX = 640;

/** Filters, shape state and the last reading for whichever hand holds one role. */
class SlotReader {
	#fx: OneEuro;
	#fy: OneEuro;
	#fr: OneEuro;
	#classifier = new ShapeClassifier();
	#shape = new Debounced<Shape>('none');
	#prev: HandReading | null = null;
	#id: number | null = null;

	constructor(pointer: OneEuroOptions, pinch: OneEuroOptions) {
		this.#fx = new OneEuro(pointer);
		this.#fy = new OneEuro(pointer);
		this.#fr = new OneEuro(pinch);
	}

	read(tracked: TrackedHand | null, frame: RawFrame, crossing: boolean): HandReading | null {
		if (tracked?.id !== this.#id) {
			[this.#fx, this.#fy, this.#fr].forEach((f) => f.reset());
			this.#classifier = new ShapeClassifier();
			this.#shape.reset();
		}
		const wasPinching = tracked?.id === this.#id && !!this.#prev?.pinching;
		this.#id = tracked?.id ?? null;
		if (!tracked) return (this.#prev = null);
		const { landmarks } = tracked.hand;
		const raw = pointerOf(landmarks);
		const ratio = this.#fr.filter(pinchRatio(landmarks, frame.aspect), frame.time);
		const candidate = isPinching(ratio, wasPinching) && (wasPinching || !crossing);
		const { shape, pinching } = this.#classifier.read(landmarks, frame.aspect, candidate);
		return (this.#prev = {
			id: tracked.id,
			pointer: {
				x: this.#fx.filter(raw.x * PX, frame.time) / PX,
				y: this.#fy.filter(raw.y * PX, frame.time) / PX
			},
			pinching,
			shape: this.#shape.update(shape),
			wrist: { x: 1 - landmarks[0].x, y: landmarks[0].y },
			openness: openness(measure(landmarks, frame.aspect))
		});
	}
}

/** Everything between the camera and the garden, as a pure function of the frames so far. */
export function createPipeline(options: PipelineOptions = {}): Pipeline {
	const {
		pointerFilter = { minCutoff: 1, beta: 0.02, dCutoff: 1 },
		pinchFilter = { minCutoff: 3, beta: 0.3, dCutoff: 1 },
		...slotOptions
	} = options;
	const slots = new HandSlots(slotOptions);
	const drawing = new SlotReader(pointerFilter, pinchFilter);
	const off = new SlotReader(pointerFilter, pinchFilter);
	return (frame) => {
		const tracked = slots.update(frame);
		return {
			drawing: drawing.read(tracked.drawing, frame, tracked.crossing),
			off: off.read(tracked.off, frame, tracked.crossing),
			crossing: tracked.crossing
		};
	};
}
