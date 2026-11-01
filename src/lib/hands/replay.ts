import { handEvent, type HandEvent, type HandState } from './gesture.js';
import type { RawFrame } from './frames.js';
import type { Pipeline } from './pipeline.js';

export interface ReplayEvent {
	time: number;
	event: HandEvent | null;
	pointer: HandState['pointer'] | null;
}

/** Runs a clip through a pipeline and reports what the canvas would have received each frame. */
export function replay(clip: readonly RawFrame[], pipeline: Pipeline): ReplayEvent[] {
	let prev: HandState | null = null;
	return clip.map((frame) => {
		const next = pipeline(frame);
		const event = handEvent(prev, next);
		prev = next;
		return { time: frame.time, event, pointer: next?.pointer ?? null };
	});
}
