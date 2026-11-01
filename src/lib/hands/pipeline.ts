import { readHand, type HandState } from './gesture.js';
import type { RawFrame } from './frames.js';
import { HandSlots, type SlotOptions } from './identity.js';

export type Pipeline = (frame: RawFrame) => HandState | null;

/** Everything between the camera and the garden, as a pure function of the frames so far. */
export function createPipeline(options: SlotOptions = {}): Pipeline {
	const slots = new HandSlots(options);
	let prev: HandState | null = null;
	let prevId: number | null = null;
	return (frame) => {
		const { drawing, crossing } = slots.update(frame);
		const wasPinching = drawing?.id === prevId && !!prev?.pinching;
		const next = drawing ? readHand(drawing.hand.landmarks, wasPinching, frame.aspect) : null;
		if (next && crossing && !wasPinching) next.pinching = false;
		prev = next;
		prevId = drawing?.id ?? null;
		return next;
	};
}
