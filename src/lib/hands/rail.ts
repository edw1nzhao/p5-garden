import { MODE_CONSTANTS } from './modes.js';

export type Role = 'drawing' | 'off';

export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface RailLayout {
	rail: Box | null;
	tiles: (Box & { id: string })[];
}

export interface RailPointer {
	/** Client coordinates. */
	x: number;
	y: number;
	pinching: boolean;
}

export type RailInput = Record<Role, RailPointer | null>;

export interface RailHover {
	id: string;
	/** 0 to 1 over the dwell window. */
	progress: number;
}

export interface RailResult {
	hover: Record<Role, RailHover | null>;
	/** The hand is on the rail, so its pinch belongs to the rail and not the canvas. */
	over: Record<Role, boolean>;
	/** Tiles chosen by this update. */
	selected: { id: string; role: Role }[];
	latched: string | null;
}

export const EMPTY_LAYOUT: RailLayout = { rail: null, tiles: [] };

const inside = (b: Box, x: number, y: number) =>
	x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;

export function tileAt(tiles: RailLayout['tiles'], x: number, y: number): string | null {
	const hit = tiles.find((t) => t.right > t.left && t.bottom > t.top && inside(t, x, y));
	return hit?.id ?? null;
}

interface Dwell {
	tile: string | null;
	since: number;
	fired: boolean;
	/** The pinch was already closed when the pointer reached the tile. */
	carried: boolean;
}

const fresh = (): Dwell => ({ tile: null, since: 0, fired: false, carried: false });
const ROLES: Role[] = ['drawing', 'off'];

export interface Rail {
	step(input: RailInput, layout: RailLayout, time: number): RailResult;
	/** The seed the off hand chose; a drawing-hand tap on empty canvas plants it. */
	readonly latched: string | null;
	clearLatch(): void;
}

export function createRail({ dwellMs = MODE_CONSTANTS.dwellMs } = {}): Rail {
	const state: Record<Role, Dwell> = { drawing: fresh(), off: fresh() };
	let latched: string | null = null;

	return {
		get latched() {
			return latched;
		},
		clearLatch() {
			latched = null;
		},
		step(input, layout, time) {
			const result: RailResult = {
				hover: { drawing: null, off: null },
				over: { drawing: false, off: false },
				selected: [],
				latched
			};
			for (const role of ROLES) {
				const p = input[role];
				if (!p) {
					state[role] = fresh();
					continue;
				}
				const tile = tileAt(layout.tiles, p.x, p.y);
				result.over[role] = tile !== null || (!!layout.rail && inside(layout.rail, p.x, p.y));
				if (tile !== state[role].tile)
					state[role] = { tile, since: time, fired: false, carried: p.pinching };
				const s = state[role];
				if (!p.pinching && s.carried) {
					s.carried = false;
					s.since = time;
				}
				if (!tile) continue;
				if (s.fired || s.carried) {
					result.hover[role] = { id: tile, progress: s.fired ? 1 : 0 };
					continue;
				}
				const progress = Math.min(1, (time - s.since) / dwellMs);
				result.hover[role] = { id: tile, progress };
				if (!p.pinching && progress < 1) continue;
				s.fired = true;
				result.hover[role] = { id: tile, progress: 1 };
				result.selected.push({ id: tile, role });
				if (role === 'off') latched = latched === tile ? null : tile;
			}
			result.latched = latched;
			return result;
		}
	};
}
