import type { HandsState } from './pipeline.js';
import { createRail, EMPTY_LAYOUT, type RailHover, type RailLayout } from './rail.js';

export interface StageBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** What the hands are doing to the seed rail, shared by the page, the stage and the legend. */
class HandRail {
	/** Set by the page whenever the tiles move. */
	layout: RailLayout = EMPTY_LAYOUT;
	hover = $state.raw<RailHover | null>(null);
	latched = $state<string | null>(null);
	#rail = createRail();

	/** Feeds one tracker frame; returns the tiles chosen and whether the drawing hand is on the rail. */
	update(hands: HandsState, time: number, stage: StageBox) {
		const point = (h: HandsState['drawing']) =>
			h && {
				x: stage.left + h.pointer.x * stage.width,
				y: stage.top + h.pointer.y * stage.height,
				pinching: h.pinching
			};
		const result = this.#rail.step(
			{ drawing: point(hands.drawing), off: point(hands.off) },
			this.layout,
			time
		);
		const shown = result.hover.drawing ?? result.hover.off;
		if (shown?.id !== this.hover?.id || shown?.progress !== this.hover?.progress)
			this.hover = shown;
		if (result.latched !== this.latched) this.latched = result.latched;
		return result;
	}

	clearLatch() {
		this.#rail.clearLatch();
		this.latched = null;
	}

	reset() {
		this.#rail.step({ drawing: null, off: null }, EMPTY_LAYOUT, 0);
		this.clearLatch();
		this.hover = null;
	}
}

export const handRail = new HandRail();
