import { settings } from '../settings.svelte.js';
import {
	Guide,
	type GuideEffect,
	type GuideInput,
	type GuideState,
	type Step
} from './onboarding.js';

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
		if (this.open) this.#apply(this.#guide.feed(input));
	}

	tick(time: number) {
		if (this.open) this.#apply(this.#guide.tick(time));
	}

	next() {
		this.#guide.next();
		this.state = this.#guide.state;
	}

	redoPrevious() {
		this.#guide.redoPrevious();
		this.state = this.#guide.state;
	}

	hold(active: boolean) {
		this.#guide.hold(active);
	}

	#apply(effects: GuideEffect[]) {
		for (const effect of effects) {
			if (effect.type === 'labelsInverted') settings.labelsInverted = effect.value;
			else if (effect.type === 'calibrated') settings.calibration = effect.templates;
			else this.close();
		}
		this.state = this.#guide.state;
	}

	/** Closes the card; `seen` marks the guide as shown so it does not open on its own again. */
	close(seen = true) {
		this.open = false;
		if (seen) settings.handsOnboarded = true;
	}
}

export const guide = new GuideSession();
