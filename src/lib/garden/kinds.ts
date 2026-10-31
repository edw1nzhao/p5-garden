import type p5 from 'p5';
import type { ElementKind, GardenElement } from '#lib/scene/scene.svelte.js';
import { DRAW } from './art.js';

export interface Kind {
	label: string;
	/** Short phrase for the canvas description. */
	noun: string;
	/** Draws in the element's frame: centred at 0,0, radius `r`, rotation already applied. */
	draw(p: p5, el: GardenElement, r: number, t: number): void;
}

export const KINDS: Record<ElementKind, Kind> = {
	bloom: { label: 'Bloom', noun: 'bloom', draw: DRAW.bloom },
	swarm: { label: 'Swarm', noun: 'swarm', draw: DRAW.swarm },
	ribbon: { label: 'Ribbon', noun: 'ribbon', draw: DRAW.ribbon },
	tree: { label: 'Tree', noun: 'tree', draw: DRAW.tree },
	fireflies: { label: 'Fireflies', noun: 'firefly cloud', draw: DRAW.fireflies },
	flow: { label: 'Flow', noun: 'flow', draw: DRAW.flow },
	stroke: { label: 'Paint', noun: 'painted stroke', draw: DRAW.stroke }
};

/** Kinds offered as seeds in the palette; painted strokes come from the brush. */
export const KIND_ORDER: ElementKind[] = ['bloom', 'swarm', 'ribbon', 'tree', 'fireflies', 'flow'];
