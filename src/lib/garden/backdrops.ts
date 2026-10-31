import type { Backdrop } from '#lib/scene/scene.svelte.js';
import { BACKDROPS as ART } from './art.js';

export interface BackdropStyle {
	label: string;
	/** Top and bottom of a vertical gradient. */
	colors: [string, string];
	/** Light backdrops wash out under additive blending. */
	light: boolean;
	/** Words for the canvas description. */
	words: string;
}

export const BACKDROPS: Record<Backdrop, BackdropStyle> = {
	night: {
		label: 'Night',
		colors: ART['night'].colors,
		light: ART['night'].light,
		words: 'a dark night'
	},
	dusk: {
		label: 'Dusk',
		colors: ART['dusk'].colors,
		light: ART['dusk'].light,
		words: 'a dusk sky'
	},
	'deep-sea': {
		label: 'Deep sea',
		colors: ART['deep-sea'].colors,
		light: ART['deep-sea'].light,
		words: 'deep water'
	},
	paper: {
		label: 'Paper',
		colors: ART['paper'].colors,
		light: ART['paper'].light,
		words: 'warm paper'
	}
};

export const BACKDROP_ORDER: Backdrop[] = ['night', 'dusk', 'deep-sea', 'paper'];
