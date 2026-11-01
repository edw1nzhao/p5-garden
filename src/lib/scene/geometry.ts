export interface Placed {
	id: string;
	/** Centre, as a fraction of the stage width and height. */
	x: number;
	y: number;
	scale: number;
	/** Radians, clockwise. */
	rotation: number;
}

export interface Stage {
	width: number;
	height: number;
}

import { BASE_RADIUS } from '#lib/garden/art.js';

export { BASE_RADIUS };
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 3;

export function elementRadius(el: Placed, stage: Stage): number {
	return BASE_RADIUS * Math.min(stage.width, stage.height) * el.scale;
}

/** A stage point in the element's own frame, where its edge is at distance 1. */
export function toLocal(el: Placed, px: number, py: number, stage: Stage) {
	const dx = px - el.x * stage.width;
	const dy = py - el.y * stage.height;
	const c = Math.cos(-el.rotation);
	const s = Math.sin(-el.rotation);
	const r = elementRadius(el, stage);
	return { x: (dx * c - dy * s) / r, y: (dx * s + dy * c) / r };
}

/** Every element under a stage point, topmost first; later elements draw on top. */
export function hitAll<T extends Placed>(
	elements: readonly T[],
	px: number,
	py: number,
	stage: Stage
): T[] {
	const hits: T[] = [];
	for (let i = elements.length - 1; i >= 0; i--) {
		const local = toLocal(elements[i], px, py, stage);
		if (Math.hypot(local.x, local.y) <= 1) hits.push(elements[i]);
	}
	return hits;
}

/** The topmost element under a stage point; later elements draw on top. */
export function hitTest<T extends Placed>(
	elements: readonly T[],
	px: number,
	py: number,
	stage: Stage
): T | null {
	for (let i = elements.length - 1; i >= 0; i--) {
		const local = toLocal(elements[i], px, py, stage);
		if (Math.hypot(local.x, local.y) <= 1) return elements[i];
	}
	return null;
}

export interface StrokeShape {
	x: number;
	y: number;
	scale: number;
	/** Flat x,y pairs in the element's frame, where 1 is the element's radius. */
	path: number[];
}

/** Turns a painted path in stage pixels into an element centred on it. */
export function strokeFromPath(
	points: readonly { x: number; y: number }[],
	stage: Stage
): StrokeShape {
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
	const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
	const reach = Math.max(...points.map((p) => Math.hypot(p.x - cx, p.y - cy)));
	const unit = BASE_RADIUS * Math.min(stage.width, stage.height);
	const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, reach / unit));
	const r = unit * scale;
	return {
		x: cx / stage.width,
		y: cy / stage.height,
		scale,
		path: points.flatMap((p) => [(p.x - cx) / r, (p.y - cy) / r])
	};
}

/** The stroke reflected left to right across the centre of the stage. */
export function mirrorStroke(shape: StrokeShape): StrokeShape {
	return { ...shape, x: 1 - shape.x, path: shape.path.map((v, i) => (i % 2 === 0 ? -v || 0 : v)) };
}

/** Chaikin corner cutting: each pass replaces every corner with two points a quarter in. */
export function smoothPath<T extends { x: number; y: number }>(
	points: readonly T[],
	passes: number
) {
	let path: { x: number; y: number }[] = [...points];
	if (path.length < 3) return path;
	for (let pass = 0; pass < passes; pass++) {
		const next = [path[0]];
		for (let i = 0; i < path.length - 1; i++) {
			const a = path[i];
			const b = path[i + 1];
			next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
			next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
		}
		next.push(path[path.length - 1]);
		path = next;
	}
	return path;
}
