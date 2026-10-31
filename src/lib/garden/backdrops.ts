import type { Backdrop } from '#lib/scene/scene.svelte.js';

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
	night: { label: 'Night', colors: ['#0b0f19', '#111827'], light: false, words: 'a dark night' },
	dusk: { label: 'Dusk', colors: ['#1e1236', '#5a2a1f'], light: false, words: 'a dusk sky' },
	'deep-sea': {
		label: 'Deep sea',
		colors: ['#03141f', '#0b3a4a'],
		light: false,
		words: 'deep water'
	},
	paper: { label: 'Paper', colors: ['#f5f0e6', '#ebe4d6'], light: true, words: 'warm paper' }
};

export const BACKDROP_ORDER: Backdrop[] = ['night', 'dusk', 'deep-sea', 'paper'];
