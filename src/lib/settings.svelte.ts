import { parseTemplates, type Templates } from './hands/calibration.js';

export type DrawingHand = 'Right' | 'Left';

export const SETTINGS_KEY = 'p5-garden:settings';

interface Saved {
	drawingHand: DrawingHand;
	labelsInverted: boolean;
	handsOnboarded: boolean;
	calibration: Templates | null;
}

function read(): Partial<Saved> {
	try {
		const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
		const hand = saved.drawingHand;
		const calibration = parseTemplates(saved.calibration);
		return {
			...(hand === 'Left' || hand === 'Right' ? { drawingHand: hand } : {}),
			...(typeof saved.labelsInverted === 'boolean'
				? { labelsInverted: saved.labelsInverted }
				: {}),
			...(typeof saved.handsOnboarded === 'boolean'
				? { handsOnboarded: saved.handsOnboarded }
				: {}),
			...(calibration ? { calibration } : {})
		};
	} catch {
		return {};
	}
}

function write(values: Saved) {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(values));
	} catch {
		// Private windows and blocked storage just forget the choice.
	}
}

/** Preferences kept in this browser. Call `load()` once mounted, so server and client markup match. */
class Settings {
	#drawingHand = $state<DrawingHand>('Right');
	#labelsInverted = $state(false);
	#handsOnboarded = $state(false);
	#calibration = $state.raw<Templates | null>(null);

	get drawingHand() {
		return this.#drawingHand;
	}

	set drawingHand(value: DrawingHand) {
		this.#drawingHand = value;
		this.#save();
	}

	/** MediaPipe's handedness labels name the opposite hand for this user. */
	get labelsInverted() {
		return this.#labelsInverted;
	}

	set labelsInverted(value: boolean) {
		this.#labelsInverted = value;
		this.#save();
	}

	/** The hands guide has been shown once. */
	get handsOnboarded() {
		return this.#handsOnboarded;
	}

	set handsOnboarded(value: boolean) {
		this.#handsOnboarded = value;
		this.#save();
	}

	/** The user's own shape templates; null means the built-in rules. */
	get calibration() {
		return this.#calibration;
	}

	set calibration(value: Templates | null) {
		this.#calibration = value;
		this.#save();
	}

	#save() {
		write({
			drawingHand: this.#drawingHand,
			labelsInverted: this.#labelsInverted,
			handsOnboarded: this.#handsOnboarded,
			calibration: this.#calibration
		});
	}

	load() {
		const saved = read();
		this.#drawingHand = saved.drawingHand ?? this.#drawingHand;
		this.#labelsInverted = saved.labelsInverted ?? this.#labelsInverted;
		this.#handsOnboarded = saved.handsOnboarded ?? this.#handsOnboarded;
		this.#calibration = saved.calibration ?? this.#calibration;
	}
}

export const settings = new Settings();
