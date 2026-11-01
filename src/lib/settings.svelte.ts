export type DrawingHand = 'Right' | 'Left';

export const SETTINGS_KEY = 'p5-garden:settings';

function read(): DrawingHand | null {
	try {
		const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as {
			drawingHand?: unknown;
		};
		return saved.drawingHand === 'Left' || saved.drawingHand === 'Right' ? saved.drawingHand : null;
	} catch {
		return null;
	}
}

function write(drawingHand: DrawingHand) {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify({ drawingHand }));
	} catch {
		// Private windows and blocked storage just forget the choice.
	}
}

/** Preferences kept in this browser. Call `load()` once mounted, so server and client markup match. */
class Settings {
	#drawingHand = $state<DrawingHand>('Right');

	get drawingHand() {
		return this.#drawingHand;
	}

	set drawingHand(value: DrawingHand) {
		this.#drawingHand = value;
		write(value);
	}

	load() {
		this.#drawingHand = read() ?? this.#drawingHand;
	}
}

export const settings = new Settings();
