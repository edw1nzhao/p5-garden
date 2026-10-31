import type { Placed } from './geometry.js';

export type ElementKind = 'bloom' | 'swarm' | 'ribbon';

export interface GardenElement extends Placed {
	kind: ElementKind;
	seed: number;
	hue: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 3;

export class Scene {
	elements = $state<GardenElement[]>([]);
	selectedId = $state<string | null>(null);
	selected = $derived(this.elements.find((e) => e.id === this.selectedId) ?? null);

	#random: () => number;
	#count = 0;

	constructor(random: () => number = Math.random) {
		this.#random = random;
	}

	add(kind: ElementKind, x: number, y: number): string {
		const id = `${kind}-${++this.#count}`;
		this.elements.push({
			id,
			kind,
			x: clamp(x, 0, 1),
			y: clamp(y, 0, 1),
			scale: 1,
			rotation: 0,
			seed: Math.floor(this.#random() * 2 ** 31),
			hue: Math.round(this.#random() * 360)
		});
		this.selectedId = id;
		return id;
	}

	select(id: string | null) {
		this.selectedId = id;
	}

	move(id: string, x: number, y: number) {
		const el = this.#get(id);
		if (!el) return;
		el.x = clamp(x, 0, 1);
		el.y = clamp(y, 0, 1);
	}

	transform(id: string, change: { scale?: number; rotation?: number }) {
		const el = this.#get(id);
		if (!el) return;
		if (change.scale !== undefined) el.scale = clamp(change.scale, MIN_SCALE, MAX_SCALE);
		if (change.rotation !== undefined) el.rotation = change.rotation;
	}

	raise(id: string) {
		const i = this.elements.findIndex((e) => e.id === id);
		if (i >= 0 && i < this.elements.length - 1) this.elements.push(...this.elements.splice(i, 1));
	}

	remove(id: string) {
		this.elements = this.elements.filter((e) => e.id !== id);
		if (this.selectedId === id) this.selectedId = null;
	}

	#get(id: string) {
		return this.elements.find((e) => e.id === id);
	}
}
