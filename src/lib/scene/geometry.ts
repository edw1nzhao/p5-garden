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

/** An element's radius at scale 1, as a fraction of the stage's shorter side. */
export const BASE_RADIUS = 0.12;

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
