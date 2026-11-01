export interface OneEuroOptions {
	/** Hz; lower removes more jitter at rest. */
	minCutoff: number;
	/** How fast the cutoff rises with speed; higher removes lag on fast moves. */
	beta: number;
	/** Hz, for smoothing the speed estimate itself. */
	dCutoff: number;
}

const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

/** The One Euro filter (Casiez, Roussel and Vogel, CHI 2012), for one value over time in ms. */
export class OneEuro {
	#options: OneEuroOptions;
	#value: number | null = null;
	#speed = 0;
	#time = 0;

	constructor(options: OneEuroOptions) {
		this.#options = options;
	}

	filter(value: number, time: number): number {
		if (this.#value === null) {
			this.#value = value;
			this.#time = time;
			return value;
		}
		const dt = (time - this.#time) / 1000;
		if (dt <= 0) return this.#value;
		const { minCutoff, beta, dCutoff } = this.#options;
		const a = alpha(dCutoff, dt);
		this.#speed += a * ((value - this.#value) / dt - this.#speed);
		this.#value += alpha(minCutoff + beta * Math.abs(this.#speed), dt) * (value - this.#value);
		this.#time = time;
		return this.#value;
	}

	reset() {
		this.#value = null;
		this.#speed = 0;
	}
}
