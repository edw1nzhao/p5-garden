export type DrawingHand = 'Right' | 'Left';

export const SETTINGS_KEY = 'p5-garden:settings';

interface Saved {
	drawingHand: DrawingHand;
	sweepToClear: boolean;
}

function read(): Partial<Saved> {
	try {
		const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
		const hand = saved.drawingHand;
		return {
			...(hand === 'Left' || hand === 'Right' ? { drawingHand: hand } : {}),
			...(typeof saved.sweepToClear === 'boolean' ? { sweepToClear: saved.sweepToClear } : {})
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
	#sweepToClear = $state(true);

	get drawingHand() {
		return this.#drawingHand;
	}

	set drawingHand(value: DrawingHand) {
		this.#drawingHand = value;
		this.#save();
	}

	get sweepToClear() {
		return this.#sweepToClear;
	}

	set sweepToClear(value: boolean) {
		this.#sweepToClear = value;
		this.#save();
	}

	#save() {
		write({ drawingHand: this.#drawingHand, sweepToClear: this.#sweepToClear });
	}

	load() {
		const saved = read();
		this.#drawingHand = saved.drawingHand ?? this.#drawingHand;
		this.#sweepToClear = saved.sweepToClear ?? this.#sweepToClear;
	}
}

export const settings = new Settings();
