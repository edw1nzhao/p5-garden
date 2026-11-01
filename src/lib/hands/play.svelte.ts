import type { HandsState } from './pipeline.js';
import { createModes, IDLE, type Intents } from './modes.js';

/** What the off hand is asking for right now, shared by the canvas, the sketch and the legend. */
class HandPlay {
	intents = $state.raw<Intents>(IDLE);
	/** Set by the stage; the clear gesture is ignored while this says the garden is empty. */
	canClear = () => true;
	/** Set by the stage; true while the drawing hand holds a plant, so two pinches transform it. */
	grabbing = () => false;
	#modes = createModes({
		canClear: () => this.canClear(),
		grabbing: () => this.grabbing()
	});

	update(hands: HandsState, time: number, size: { width: number; height: number }) {
		return (this.intents = this.#modes.step(hands, time, size));
	}

	/** The breeze's strength at a wall-clock time, decaying between camera frames. */
	gust(time: number) {
		return this.#modes.gustAt(time);
	}
}

export const play = new HandPlay();
