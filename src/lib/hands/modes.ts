import type { Brush } from '../scene/scene.svelte.js';
import type { HandReading, HandsState } from './pipeline.js';
import type { Shape } from './shapes.js';

export type Mode = 'none' | 'vine' | 'silk' | 'shimmer' | 'mirror' | 'colour' | 'breeze' | 'zoom';

/** Every threshold that can only be tuned with real hands. */
export const MODE_CONSTANTS = {
	hueSteps: 24,
	/** Off-hand wrist heights (frame fractions) that map to the first and last hue. */
	hueTop: 0.1,
	hueBottom: 0.9,
	/** Frame widths per second at which the gust is full, and the speed below which it is zero. */
	gustFullSpeed: 1.6,
	gustDeadzone: 0.2,
	gustMax: 0.8,
	gustAttackMs: 150,
	gustDecayMs: 700,
	sweepDistance: 0.6,
	sweepWindowMs: 600,
	sweepCooldownMs: 1500,
	/** Largest zoom factor accepted in one frame, in either direction. */
	zoomMaxStep: 1.5,
	/** Pinch separation in stage pixels below which the zoom factor is held at 1. */
	zoomMinSpan: 8
};
export type ModeConstants = typeof MODE_CONSTANTS;

export interface ViewDelta {
	factor: number;
	/** Pinch midpoint, in stage pixels. */
	cx: number;
	cy: number;
	/** Midpoint movement since the last frame, in stage pixels. */
	dx: number;
	dy: number;
}

export interface Intents {
	mode: Mode;
	/** Brush forced by the off hand; null leaves the toolbar's brush. */
	brush: Brush | null;
	/** The off hand holds a brush shape, so a drawing-hand pinch paints whatever the tool. */
	paints: boolean;
	mirror: boolean;
	/** Hue latched by the colour picker; null until the picker has been used. */
	hue: number | null;
	picking: boolean;
	/** Transient extra wind, 0 to 1. */
	gust: number;
	/** The garden should be cleared now (fires for one update). */
	wipe: boolean;
	/** Which way the sweep travelled on screen: 1 rightward, -1 leftward, 0 when not wiping. */
	wipeDir: -1 | 0 | 1;
	/** Zoom and pan to apply this update. */
	view: ViewDelta | null;
	/** Abandon the drawing hand's current action (fires for one update). */
	cancel: boolean;
	/** The drawing hand's pinch as the canvas should see it. */
	pinching: boolean;
}

export const IDLE: Intents = {
	mode: 'none',
	brush: null,
	paints: false,
	mirror: false,
	hue: null,
	picking: false,
	gust: 0,
	wipe: false,
	wipeDir: 0,
	view: null,
	cancel: false,
	pinching: false
};

const BRUSH_SHAPES: Partial<Record<Shape, { mode: Mode; brush: Brush | null }>> = {
	fist: { mode: 'vine', brush: 'vine' },
	one: { mode: 'silk', brush: 'silk' },
	two: { mode: 'shimmer', brush: 'shimmer' },
	three: { mode: 'mirror', brush: null }
};

export interface ModeOptions {
	constants?: Partial<ModeConstants>;
	/** Read on every update, so the setting can change while hands are tracked. */
	sweepEnabled?: () => boolean;
}

export interface Modes {
	/** Feeds one tracker frame; `time` is milliseconds and `size` the stage in pixels. */
	step(hands: HandsState, time: number, size?: { width: number; height: number }): Intents;
	/** The gust at a later time, decayed since the last step. */
	gustAt(time: number): number;
}

export function createModes({ constants, sweepEnabled = () => true }: ModeOptions = {}): Modes {
	const c = { ...MODE_CONSTANTS, ...constants };
	let hue: number | null = null;
	let gust = 0;
	let gustTime = 0;
	let lastTime: number | null = null;
	let samples: { x: number; t: number }[] = [];
	let cooldownUntil = -Infinity;
	let zoom: { span: number; x: number; y: number } | null = null;
	let blocked = false;

	const gustAt = (time: number) => gust * Math.exp(-Math.max(0, time - gustTime) / c.gustDecayMs);

	function quantiseHue(y: number) {
		const t = (y - c.hueTop) / (c.hueBottom - c.hueTop);
		const step = Math.min(c.hueSteps - 1, Math.max(0, Math.floor(t * c.hueSteps)));
		return (step * 360) / c.hueSteps;
	}

	function updateGust(target: number, time: number) {
		const decayed = gustAt(time);
		const dt = lastTime === null ? 0 : Math.max(0, time - lastTime);
		gust =
			target > decayed
				? decayed + (target - decayed) * (1 - Math.exp(-dt / c.gustAttackMs))
				: decayed;
		gustTime = time;
	}

	/** The direction of travel once the open palm has crossed `sweepDistance` within the window. */
	function swept(x: number, time: number): -1 | 0 | 1 {
		samples = samples.filter((s) => time - s.t <= c.sweepWindowMs);
		samples.push({ x, t: time });
		const xs = samples.map((s) => s.x);
		if (x - Math.min(...xs) >= c.sweepDistance) return 1;
		return Math.max(...xs) - x >= c.sweepDistance ? -1 : 0;
	}

	function pinchZoom(
		a: HandReading,
		b: HandReading,
		size: { width: number; height: number }
	): ViewDelta | null {
		const ax = a.pointer.x * size.width;
		const ay = a.pointer.y * size.height;
		const bx = b.pointer.x * size.width;
		const by = b.pointer.y * size.height;
		const next = { span: Math.hypot(ax - bx, ay - by), x: (ax + bx) / 2, y: (ay + by) / 2 };
		const prev = zoom;
		zoom = next;
		if (!prev) return null;
		const ratio =
			prev.span >= c.zoomMinSpan && next.span >= c.zoomMinSpan ? next.span / prev.span : 1;
		const factor = Math.min(c.zoomMaxStep, Math.max(1 / c.zoomMaxStep, ratio));
		return { factor, cx: next.x, cy: next.y, dx: next.x - prev.x, dy: next.y - prev.y };
	}

	return {
		gustAt,
		step({ drawing, off, crossing }, time, size = { width: 1, height: 1 }) {
			const bothPinching = !!drawing?.pinching && !!off?.pinching;
			const zooming = bothPinching && !crossing;
			let cancel = false;
			let view: ViewDelta | null = null;
			if (zooming) {
				cancel = zoom === null;
				view = pinchZoom(drawing, off, size);
			} else if (zoom) {
				zoom = null;
				blocked = !!drawing?.pinching;
			}
			if (!drawing?.pinching) blocked = false;

			const shape = off?.shape ?? 'none';
			const open = !!off && shape === 'open' && !crossing && !zooming;
			let wipeDir: -1 | 0 | 1 = 0;
			let target = 0;
			if (open) {
				const prev = samples.at(-1);
				if (prev && time > prev.t) {
					const speed = Math.abs(off.wrist.x - prev.x) / ((time - prev.t) / 1000);
					target = Math.min(
						1,
						Math.max(0, speed - c.gustDeadzone) / (c.gustFullSpeed - c.gustDeadzone)
					);
				}
				const dir = swept(off.wrist.x, time);
				if (dir && sweepEnabled() && !drawing?.pinching && time >= cooldownUntil) {
					wipeDir = dir;
					cooldownUntil = time + c.sweepCooldownMs;
					samples = [];
				}
			} else if (!off || crossing || zooming) {
				samples = [];
			}
			updateGust(target * c.gustMax, time);
			lastTime = time;

			const picking = !!off && shape === 'L' && !crossing && !zooming;
			if (picking) hue = quantiseHue(off.wrist.y);

			const brushShape = off && !zooming ? BRUSH_SHAPES[shape] : undefined;
			const mode: Mode = zooming
				? 'zoom'
				: (brushShape?.mode ?? (picking ? 'colour' : open ? 'breeze' : 'none'));
			return {
				mode,
				brush: brushShape?.brush ?? null,
				paints: !!brushShape,
				mirror: mode === 'mirror',
				hue,
				picking,
				gust: gustAt(time),
				wipe: wipeDir !== 0,
				wipeDir,
				view,
				cancel,
				pinching: !!drawing?.pinching && !zooming && !blocked
			};
		}
	};
}
