import { settings } from '../settings.svelte.js';
import type { CalibratedShape } from './calibration.js';
import { Guide, type GuideInput, type GuideState, type Step } from './onboarding.js';

/** The first-use hands guide: whether it is showing and where it has got to. */
class GuideSession {
	open = $state(false);
	state = $state.raw<GuideState>(new Guide().state);
	#guide = new Guide();

	start(step: Step = 'hand') {
		this.#guide = new Guide(step);
		this.state = this.#guide.state;
		this.open = true;
	}

	feed(input: GuideInput) {
		if (!this.open) return;
		for (const effect of this.#guide.feed(input)) settings.labelsInverted = effect.value;
		this.state = this.#guide.state;
	}

	next() {
		this.#guide.next();
		this.state = this.#guide.state;
	}

	retry(shape: CalibratedShape) {
		this.#guide.retry(shape);
		this.state = this.#guide.state;
	}

	/** Keeps the calibration when all six shapes were held, then moves to the last step. */
	finishCalibration() {
		const { templates } = this.#guide.state.calibrate;
		if (templates) settings.calibration = templates;
		this.next();
	}

	/** Closes the card; `seen` marks the guide as shown so it does not open on its own again. */
	close(seen = true) {
		this.open = false;
		if (seen) settings.handsOnboarded = true;
	}
}

export const guide = new GuideSession();
