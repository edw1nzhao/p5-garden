import { readHand, type HandState } from './gesture.js';
import type { RawFrame } from './frames.js';

export type Pipeline = (frame: RawFrame) => HandState | null;

/** Everything between the camera and the garden, as a pure function of the frames so far. */
export function createPipeline(): Pipeline {
	let prev: HandState | null = null;
	return (frame) => {
		const first = frame.hands[0];
		prev = first ? readHand(first.landmarks, prev?.pinching ?? false, frame.aspect) : null;
		return prev;
	};
}
