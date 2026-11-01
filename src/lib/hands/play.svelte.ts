import { settings } from '../settings.svelte.js';
import type { HandsState } from './pipeline.js';
import { createModes, IDLE, type Intents } from './modes.js';

/** What the off hand is asking for right now, shared by the canvas, the sketch and the legend. */
class HandPlay {
	intents = $state.raw<Intents>(IDLE);
	#modes = createModes({ sweepEnabled: () => settings.sweepToClear });

	update(hands: HandsState, time: number, size: { width: number; height: number }) {
		return (this.intents = this.#modes.step(hands, time, size));
	}

	/** The breeze's strength at a wall-clock time, decaying between camera frames. */
	gust(time: number) {
		return this.#modes.gustAt(time);
	}
}

export const play = new HandPlay();
