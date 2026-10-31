import type p5 from 'p5';
import type { ElementKind, GardenElement } from '#lib/scene/scene.svelte.js';
import { KINDS, KIND_ORDER } from './kinds.js';

const HUES: Partial<Record<ElementKind, number>> = {
	bloom: 330,
	swarm: 200,
	ribbon: 160,
	tree: 345,
	fireflies: 55,
	flow: 190
};

/** Palette icons, rendered once by the garden sketch so they show the real art. */
export const thumbnails = $state<Partial<Record<ElementKind, string>>>({});

/** Draws each kind on the sketch's canvas and keeps a data URL of it; call before the first frame. */
export function renderThumbnails(p: p5) {
	const size = Math.min(p.width, p.height);
	for (const kind of KIND_ORDER) {
		const el: GardenElement = {
			id: `thumb-${kind}`,
			kind,
			x: 0.5,
			y: 0.5,
			scale: 1,
			rotation: 0,
			seed: 20261031,
			hue: HUES[kind] ?? 200,
			vividness: 1,
			density: 1,
			speed: 1
		};
		p.clear();
		p.background(228, 45, 9);
		p.push();
		p.translate(size / 2, size / 2);
		KINDS[kind].draw(p, el, size * 0.4, 2);
		p.pop();
		thumbnails[kind] = (p.drawingContext as CanvasRenderingContext2D).canvas.toDataURL();
	}
	p.clear();
}
