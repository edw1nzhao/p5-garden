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
	/** Both open palms held still this long clear the garden. */
	clearHoldMs: 1200,
	/** Frame widths a wrist may stray from where the hold began. */
	clearMoveTolerance: 0.04,
	clearCooldownMs: 2000,
	frameAspect: 4 / 3,
	/** Largest zoom factor accepted in one frame, in either direction. */
	zoomMaxStep: 1.5,
	/** Pinch separation in stage pixels below which the zoom factor is held at 1. */
	zoomMinSpan: 8
};
interface Vec {
	x: number;
	y: number;
}

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

/** A held plant's change since the two-hand gesture began, never per-frame. */
export interface TransformDelta {
	/** Current pinch span over the span at the start. */
	scale: number;
	/** Unwrapped change in the angle between the pinches, in radians. */
	rotation: number;
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
	/** How far the two-palm hold has come, 0 to 1. */
	clearProgress: number;
	/** Zoom and pan to apply this update. */
	view: ViewDelta | null;
	/** Resize and turn the held plant instead of the view; the first update is the identity. */
	transform: TransformDelta | null;
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
	clearProgress: 0,
	view: null,
	transform: null,
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
	/** Read on every update; false while the garden is empty. */
	canClear?: () => boolean;
	/** Read when two pinches begin: true while the drawing hand holds a plant. */
	grabbing?: () => boolean;
}

export interface Modes {
	/** Feeds one tracker frame; `time` is milliseconds and `size` the stage in pixels. */
	step(hands: HandsState, time: number, size?: { width: number; height: number }): Intents;
	/** The gust at a later time, decayed since the last step. */
	gustAt(time: number): number;
}

export function createModes({
	constants,
	canClear = () => true,
	grabbing = () => false
}: ModeOptions = {}): Modes {
	const c = { ...MODE_CONSTANTS, ...constants };
	let hue: number | null = null;
	let gust = 0;
	let gustTime = 0;
	let lastTime: number | null = null;
	let prevWrist: { x: number; t: number } | null = null;
	let hold: { start: number; drawing: Vec; off: Vec } | null = null;
	let cooldownUntil = -Infinity;
	let zoom: {
		span: number;
		x: number;
		y: number;
		angle: number;
		held: boolean;
		startSpan: number;
		turned: number;
	} | null = null;
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

	function clearHold(
		drawing: HandReading | null,
		off: HandReading | null,
		eligible: boolean,
		time: number
	): { progress: number; fire: boolean } {
		if (!drawing || !off || !eligible || time < cooldownUntil || !canClear()) {
			hold = null;
			return { progress: 0, fire: false };
		}
		const strayed = (now: Vec, then: Vec) =>
			Math.hypot(now.x - then.x, (now.y - then.y) / c.frameAspect) > c.clearMoveTolerance;
		if (!hold || strayed(drawing.wrist, hold.drawing) || strayed(off.wrist, hold.off))
			hold = { start: time, drawing: drawing.wrist, off: off.wrist };
		const progress = Math.min(1, (time - hold.start) / c.clearHoldMs);
		if (progress < 1) return { progress, fire: false };
		hold = null;
		cooldownUntil = time + c.clearCooldownMs;
		return { progress: 0, fire: true };
	}

	const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

	function pinch(
		a: HandReading,
		b: HandReading,
		size: { width: number; height: number }
	): { view: ViewDelta | null; transform: TransformDelta | null } {
		const ax = a.pointer.x * size.width;
		const ay = a.pointer.y * size.height;
		const bx = b.pointer.x * size.width;
		const by = b.pointer.y * size.height;
		const span = Math.hypot(ax - bx, ay - by);
		const angle = Math.atan2(by - ay, bx - ax);
		const x = (ax + bx) / 2;
		const y = (ay + by) / 2;
		const prev = zoom;
		if (!prev) {
			const held = grabbing();
			zoom = { span, x, y, angle, held, startSpan: Math.max(span, c.zoomMinSpan), turned: 0 };
			return { view: null, transform: held ? { scale: 1, rotation: 0 } : null };
		}
		const settled = prev.span >= c.zoomMinSpan && span >= c.zoomMinSpan;
		zoom = { ...prev, span, x, y };
		if (prev.held) {
			if (span >= c.zoomMinSpan) {
				zoom.turned += wrap(angle - prev.angle);
				zoom.angle = angle;
			}
			const scale = Math.max(span, c.zoomMinSpan) / prev.startSpan;
			return { view: null, transform: { scale, rotation: zoom.turned } };
		}
		const factor = Math.min(
			c.zoomMaxStep,
			Math.max(1 / c.zoomMaxStep, settled ? span / prev.span : 1)
		);
		return { view: { factor, cx: x, cy: y, dx: x - prev.x, dy: y - prev.y }, transform: null };
	}

	return {
		gustAt,
		step({ drawing, off, crossing }, time, size = { width: 1, height: 1 }) {
			const bothPinching = !!drawing?.pinching && !!off?.pinching;
			const zooming = bothPinching && !crossing;
			let cancel = false;
			let view: ViewDelta | null = null;
			let transform: TransformDelta | null = null;
			if (zooming) {
				cancel = zoom === null;
				({ view, transform } = pinch(drawing, off, size));
			} else if (zoom) {
				zoom = null;
				blocked = !!drawing?.pinching;
			}
			if (!drawing?.pinching) blocked = false;

			const shape = off?.shape ?? 'none';
			const open = !!off && shape === 'open' && !crossing && !zooming;
			let target = 0;
			if (open) {
				if (prevWrist && time > prevWrist.t) {
					const speed = Math.abs(off.wrist.x - prevWrist.x) / ((time - prevWrist.t) / 1000);
					target = Math.min(
						1,
						Math.max(0, speed - c.gustDeadzone) / (c.gustFullSpeed - c.gustDeadzone)
					);
				}
				prevWrist = { x: off.wrist.x, t: time };
			} else {
				prevWrist = null;
			}
			const bothOpen = open && drawing?.shape === 'open';
			const clearing = clearHold(drawing, off, bothOpen, time);
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
				wipe: clearing.fire,
				clearProgress: clearing.progress,
				view,
				transform,
				cancel,
				pinching: !!drawing?.pinching && !zooming && !blocked
			};
		}
	};
}
