import { MAX_SCALE, MIN_SCALE, type Placed, type StrokeShape } from './geometry.js';

export { MAX_SCALE, MIN_SCALE };

export type ElementKind = 'bloom' | 'swarm' | 'ribbon' | 'tree' | 'fireflies' | 'flow' | 'stroke';
export type Brush = 'vine' | 'shimmer' | 'silk';

export interface Style {
	/** Base hue in degrees. */
	hue: number;
	/** Saturation multiplier; 1 is the kind's own look. */
	vividness: number;
	/** How many petals, particles or strands, as a multiplier. */
	density: number;
	/** Animation speed multiplier; 0 holds still. */
	speed: number;
}

export interface GardenElement extends Placed, Style {
	kind: ElementKind;
	seed: number;
	/** Painted strokes only. */
	brush?: Brush;
	path?: number[];
}

export const STYLE_RANGES = {
	vividness: { min: 0, max: 1.5 },
	density: { min: 0.3, max: 2 },
	speed: { min: 0, max: 3 }
} as const;

export type Backdrop = 'night' | 'dusk' | 'deep-sea' | 'paper';

export interface Mood {
	backdrop: Backdrop;
	/** 0 is still air; 1 sways every element noticeably. */
	wind: number;
	/** Additive blending, which reads as light on dark backdrops. */
	glow: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Scene {
	elements = $state<GardenElement[]>([]);
	selectedId = $state<string | null>(null);
	mood = $state<Mood>({ backdrop: 'night', wind: 0, glow: false });
	/** The stroke being painted, as stage fractions; null when not painting. */
	draft = $state<{ x: number; y: number }[] | null>(null);
	selected = $derived(this.elements.find((e) => e.id === this.selectedId) ?? null);

	#random: () => number;
	#count = 0;

	constructor(random: () => number = Math.random) {
		this.#random = random;
	}

	add(kind: ElementKind, x: number, y: number): string {
		return this.#push({ kind, x: clamp(x, 0, 1), y: clamp(y, 0, 1), scale: 1 });
	}

	addStroke(brush: Brush, shape: StrokeShape): string {
		return this.#push({ kind: 'stroke', brush, ...shape });
	}

	#push(fields: Pick<GardenElement, 'kind' | 'x' | 'y' | 'scale'> & Partial<GardenElement>) {
		const id = `${fields.kind}-${++this.#count}`;
		this.elements.push({
			id,
			rotation: 0,
			seed: this.#seed(),
			hue: Math.round(this.#random() * 360),
			vividness: 1,
			density: 1,
			speed: 1,
			...fields
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

	update(id: string, change: Partial<Style>) {
		const el = this.#get(id);
		if (!el) return;
		if (change.hue !== undefined) el.hue = ((Math.round(change.hue) % 360) + 360) % 360;
		for (const key of ['vividness', 'density', 'speed'] as const) {
			const v = change[key];
			if (v !== undefined) el[key] = clamp(v, STYLE_RANGES[key].min, STYLE_RANGES[key].max);
		}
	}

	setMood(change: Partial<Mood>) {
		if (change.backdrop !== undefined) this.mood.backdrop = change.backdrop;
		if (change.wind !== undefined) this.mood.wind = clamp(change.wind, 0, 1);
		if (change.glow !== undefined) this.mood.glow = change.glow;
	}

	reroll(id: string) {
		const el = this.#get(id);
		if (el) el.seed = this.#seed();
	}

	raise(id: string) {
		const i = this.elements.findIndex((e) => e.id === id);
		if (i >= 0 && i < this.elements.length - 1) this.elements.push(...this.elements.splice(i, 1));
	}

	remove(id: string) {
		this.elements = this.elements.filter((e) => e.id !== id);
		if (this.selectedId === id) this.selectedId = null;
	}

	#seed() {
		return Math.floor(this.#random() * 2 ** 31);
	}

	#get(id: string) {
		return this.elements.find((e) => e.id === id);
	}
}
