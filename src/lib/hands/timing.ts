export type Delegate = 'GPU' | 'CPU';

/** Creates something on the GPU delegate, and again on the CPU if the GPU fails. */
export async function createWithFallback<T>(
	create: (delegate: Delegate) => Promise<T>
): Promise<{ value: T; delegate: Delegate }> {
	try {
		return { value: await create('GPU'), delegate: 'GPU' };
	} catch {
		return { value: await create('CPU'), delegate: 'CPU' };
	}
}

/** Detect-time percentiles over the last frames, and camera frames that were never detected. */
export class FrameStats {
	#times: number[] = [];
	#size: number;
	#lastPresented: number | null = null;
	#dropped = 0;

	constructor(size = 120) {
		this.#size = size;
	}

	detect(ms: number) {
		this.#times.push(ms);
		if (this.#times.length > this.#size) this.#times.shift();
	}

	presented(count: number) {
		if (this.#lastPresented !== null && count > this.#lastPresented + 1)
			this.#dropped += count - this.#lastPresented - 1;
		this.#lastPresented = count;
	}

	summary() {
		const sorted = [...this.#times].sort((a, b) => a - b);
		const at = (p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
		return { p50: at(50), p95: at(95), dropped: this.#dropped };
	}
}
