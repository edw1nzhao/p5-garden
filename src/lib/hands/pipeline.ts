import { isPinching, pinchRatio, pointerOf, type HandState } from './gesture.js';
import type { RawFrame } from './frames.js';
import { OneEuro, type OneEuroOptions } from './filter.js';
import { HandSlots, type SlotOptions } from './identity.js';

export type Pipeline = (frame: RawFrame) => HandState | null;

export interface PipelineOptions extends SlotOptions {
	pointerFilter?: OneEuroOptions;
	pinchFilter?: OneEuroOptions;
}

// The pointer is filtered in pixels of a nominal 640-wide frame, the units beta is tuned in.
const PX = 640;

/** Everything between the camera and the garden, as a pure function of the frames so far. */
export function createPipeline(options: PipelineOptions = {}): Pipeline {
	const {
		pointerFilter = { minCutoff: 1, beta: 0.02, dCutoff: 1 },
		pinchFilter = { minCutoff: 3, beta: 0.3, dCutoff: 1 },
		...slotOptions
	} = options;
	const slots = new HandSlots(slotOptions);
	const fx = new OneEuro(pointerFilter);
	const fy = new OneEuro(pointerFilter);
	const fr = new OneEuro(pinchFilter);
	let prev: HandState | null = null;
	let prevId: number | null = null;
	return (frame) => {
		const { drawing, crossing } = slots.update(frame);
		if (drawing?.id !== prevId) [fx, fy, fr].forEach((f) => f.reset());
		const wasPinching = drawing?.id === prevId && !!prev?.pinching;
		prevId = drawing?.id ?? null;
		if (!drawing) return (prev = null);
		const { landmarks } = drawing.hand;
		const raw = pointerOf(landmarks);
		const ratio = fr.filter(pinchRatio(landmarks, frame.aspect), frame.time);
		prev = {
			pointer: {
				x: fx.filter(raw.x * PX, frame.time) / PX,
				y: fy.filter(raw.y * PX, frame.time) / PX
			},
			pinching: isPinching(ratio, wasPinching) && (wasPinching || !crossing)
		};
		return prev;
	};
}
