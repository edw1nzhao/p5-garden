import type { Mode } from './modes.js';

export interface LegendEntry {
	mode: Exclude<Mode, 'none'>;
	gesture: string;
	effect: string;
	/** Hue of the badge tint and the legend dot. */
	hue: number;
}

export const LEGEND: readonly LegendEntry[] = [
	{ mode: 'vine', gesture: 'Fist', effect: 'Paint with vine', hue: 130 },
	{ mode: 'silk', gesture: 'One finger', effect: 'Paint with silk', hue: 280 },
	{ mode: 'shimmer', gesture: 'Two fingers', effect: 'Paint with shimmer', hue: 50 },
	{ mode: 'mirror', gesture: 'Three fingers', effect: 'Mirror what you paint', hue: 190 },
	{ mode: 'colour', gesture: 'L shape', effect: 'Raise or lower to pick a colour', hue: 330 },
	{ mode: 'breeze', gesture: 'Open hand', effect: 'Wave for a breeze', hue: 205 },
	{
		mode: 'zoom',
		gesture: 'Both pinch',
		effect: 'Zoom the canvas, or resize and turn a held plant',
		hue: 160
	}
];

export const MODE_HUE: Partial<Record<Mode, number>> = Object.fromEntries(
	LEGEND.map((e) => [e.mode, e.hue])
);

/** Not a mode of its own: both hands together, so it is listed after the single-hand gestures. */
export const CLEAR_ENTRY = {
	gesture: 'Both hands open',
	effect: 'Hold still to clear the garden',
	hue: 0
};

export const RAIL_ENTRY = {
	gesture: 'Point and hold a seed, or pinch it',
	effect: 'Drawing hand plants it. Off hand latches it: pinch empty canvas to plant, Esc clears',
	hue: 100
};
