export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

export interface Point {
	x: number;
	y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * How the garden is shown. Points are stage pixels: world is the stage at zoom 1, screen is
 * what the viewer sees, and screen = world * zoom + (x, y). Saved coordinates stay in world.
 */
export class View {
	zoom = $state(1);
	x = $state(0);
	y = $state(0);

	toWorld(p: Point): Point {
		return { x: (p.x - this.x) / this.zoom, y: (p.y - this.y) / this.zoom };
	}

	toScreen(p: Point): Point {
		return { x: p.x * this.zoom + this.x, y: p.y * this.zoom + this.y };
	}

	/** Multiplies the zoom, keeping the world point under the screen pixel (cx, cy) fixed. */
	zoomAt(factor: number, cx: number, cy: number) {
		const zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
		const ratio = zoom / this.zoom;
		this.x = cx - (cx - this.x) * ratio;
		this.y = cy - (cy - this.y) * ratio;
		this.zoom = zoom;
	}

	/** Shifts the view by screen pixels. */
	panBy(dx: number, dy: number) {
		this.x += dx;
		this.y += dy;
	}

	reset() {
		this.zoom = 1;
		this.x = 0;
		this.y = 0;
	}
}
