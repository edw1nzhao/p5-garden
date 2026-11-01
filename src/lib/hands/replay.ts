import { handEvent, type HandEvent, type HandState } from './gesture.js';
import type { RawFrame } from './frames.js';
import type { HandsState, Pipeline } from './pipeline.js';

export interface ReplayEvent {
	time: number;
	/** What the drawing hand did. */
	event: HandEvent | null;
	pointer: HandState['pointer'] | null;
	hands: HandsState;
}

/** Runs a clip through a pipeline and reports what the canvas would have received each frame. */
export function replay(clip: readonly RawFrame[], pipeline: Pipeline): ReplayEvent[] {
	let prev: HandState | null = null;
	return clip.map((frame) => {
		const hands = pipeline(frame);
		const next = hands.drawing;
		const event = handEvent(prev, next);
		prev = next;
		return { time: frame.time, event, pointer: next?.pointer ?? null, hands };
	});
}
