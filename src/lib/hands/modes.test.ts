import { describe, expect, it } from 'vitest';
import { View } from '../garden/view.svelte.js';
import type { Handedness, RawFrame } from './frames.js';
import { createModes, MODE_CONSTANTS, type Intents } from './modes.js';
import { createPipeline, NO_HANDS, type HandReading, type HandsState } from './pipeline.js';
import type { Shape } from './shapes.js';
import { hand, type Pose } from './synthetic.js';

const MS = 1000 / 30;
const SIZE = { width: 1000, height: 500 };

const reading = (over: Partial<HandReading> = {}): HandReading => ({
	id: 1,
	pointer: { x: 0.5, y: 0.5 },
	pinching: false,
	shape: 'none',
	wrist: { x: 0.5, y: 0.5 },
	openness: 1,
	...over
});
const hands = (
	off: Partial<HandReading> | null,
	drawing: Partial<HandReading> | null = {},
	crossing = false
): HandsState => ({
	drawing: drawing && reading({ id: 1, ...drawing }),
	off: off && reading({ id: 2, ...off }),
	crossing
});

/** Runs states at 30 fps from `start`, returning every update's intents. */
function run(modes: ReturnType<typeof createModes>, states: HandsState[], start = 0) {
	return states.map((s, i) => modes.step(s, start + i * MS, SIZE));
}
const repeat = (state: HandsState, n: number) => Array.from({ length: n }, () => state);
const last = <T>(xs: T[]) => xs[xs.length - 1];

describe('shapes pick modes', () => {
	it.each<[Shape, Partial<Intents>]>([
		['fist', { mode: 'vine', brush: 'vine', paints: true, mirror: false }],
		['one', { mode: 'silk', brush: 'silk', paints: true }],
		['two', { mode: 'shimmer', brush: 'shimmer', paints: true }],
		['three', { mode: 'mirror', brush: null, paints: true, mirror: true }],
		['L', { mode: 'colour', brush: null, paints: false, picking: true }],
		['open', { mode: 'breeze', brush: null, paints: false }],
		['pinch', { mode: 'none', brush: null, paints: false }],
		['none', { mode: 'none', brush: null, paints: false }]
	])('an off hand making %s gives %j', (shape, expected) => {
		const out = last(run(createModes(), repeat(hands({ shape }), 3)));
		expect(out).toMatchObject(expected);
	});

	it('does nothing without an off hand', () => {
		const out = run(createModes(), [hands(null), hands(null, null), NO_HANDS]);
		expect(out.every((o) => o.mode === 'none' && !o.paints && !o.wipe && !o.view)).toBe(true);
	});

	it('reads the same shapes through the real pipeline', () => {
		const aspect = 4 / 3;
		const poses: [Pose, string][] = [
			['fist', 'vine'],
			['one', 'silk'],
			['two', 'shimmer'],
			['three', 'mirror'],
			['L', 'colour'],
			['open', 'breeze']
		];
		for (const [pose, mode] of poses) {
			const pipeline = createPipeline();
			const modes = createModes();
			let out: Intents | null = null;
			for (let i = 0; i < 10; i++) {
				const frame: RawFrame = {
					time: i * MS,
					aspect,
					hands: [
						hand([0.3, 0.7], 'open', { aspect, label: 'Right' as Handedness }),
						hand([0.7, 0.7], pose, { aspect, label: 'Left' as Handedness })
					]
				};
				out = modes.step(pipeline(frame), frame.time, SIZE);
			}
			expect(out!.mode, pose).toBe(mode);
		}
	});

	it('passes a drawing-hand pinch straight through', () => {
		const out = last(run(createModes(), repeat(hands({ shape: 'fist' }, { pinching: true }), 2)));
		expect(out.pinching).toBe(true);
	});
});

describe('mid-stroke switching', () => {
	it('changes the forced brush on the update the shape changes, keeping the pinch', () => {
		const modes = createModes();
		const a = last(run(modes, repeat(hands({ shape: 'fist' }, { pinching: true }), 3)));
		const b = last(run(modes, repeat(hands({ shape: 'two' }, { pinching: true }), 3), 100));
		expect([a.brush, b.brush]).toEqual(['vine', 'shimmer']);
		expect(b.pinching).toBe(true);
	});
});

describe('colour picker', () => {
	const at = (y: number) => hands({ shape: 'L', wrist: { x: 0.5, y } });

	it('maps wrist height top to bottom onto 24 hue steps', () => {
		const { hueTop, hueBottom } = MODE_CONSTANTS;
		const hueFor = (y: number) => last(run(createModes(), [at(y)])).hue;
		expect(hueFor(0)).toBe(0);
		expect(hueFor(hueTop)).toBe(0);
		expect(hueFor(1)).toBe(345);
		expect(hueFor(hueBottom)).toBe(345);
		expect(hueFor(0.5)).toBe(180);
		const seen = new Set(
			Array.from({ length: 200 }, (_, i) => hueFor(hueTop + ((hueBottom - hueTop) * i) / 199))
		);
		expect(seen.size).toBe(24);
	});

	it('latches after the L is released', () => {
		const modes = createModes();
		run(modes, [at(0.5)]);
		const out = last(run(modes, repeat(hands({ shape: 'fist' }), 3), 100));
		expect(out).toMatchObject({ hue: 180, picking: false });
		expect(last(run(modes, [hands(null)], 200)).hue).toBe(180);
	});

	it('starts unset', () => {
		expect(last(run(createModes(), [hands({ shape: 'fist' })])).hue).toBeNull();
	});
});

describe('breeze', () => {
	const move = (modes: ReturnType<typeof createModes>, speed: number, frames: number, from = 0) => {
		const states = Array.from({ length: frames }, (_, i) =>
			hands({ shape: 'open', wrist: { x: 0.2 + (speed * (i * MS)) / 1000, y: 0.5 } })
		);
		return run(modes, states, from);
	};

	it('stays calm for a still hand and rises with speed', () => {
		const still = last(move(createModes({ sweepEnabled: () => false }), 0, 20));
		const slow = last(move(createModes({ sweepEnabled: () => false }), 0.5, 20));
		const fast = last(move(createModes({ sweepEnabled: () => false }), 1.2, 20));
		expect(still.gust).toBe(0);
		expect(slow.gust).toBeGreaterThan(0.05);
		expect(fast.gust).toBeGreaterThan(slow.gust);
		expect(fast.gust).toBeLessThanOrEqual(MODE_CONSTANTS.gustMax);
	});

	it('decays smoothly after the hand stops, even with no further updates', () => {
		const modes = createModes({ sweepEnabled: () => false });
		const peak = last(move(modes, 1.2, 20)).gust;
		const t = 19 * MS;
		const later = [0, 200, 500, 1000, 3000].map((ms) => modes.gustAt(t + ms));
		expect(later[0]).toBeCloseTo(peak, 5);
		for (let i = 1; i < later.length; i++) expect(later[i]).toBeLessThan(later[i - 1]);
		expect(later.at(-1)).toBeLessThan(peak * 0.02);
	});

	it('does not gust for other shapes', () => {
		const states = Array.from({ length: 20 }, (_, i) =>
			hands({ shape: 'fist', wrist: { x: 0.2 + i * 0.03, y: 0.5 } })
		);
		expect(last(run(createModes(), states)).gust).toBe(0);
	});
});

describe('sweep to clear', () => {
	const palm = (x: number, extra: Partial<HandsState> = {}) => ({
		...hands({ shape: 'open', wrist: { x, y: 0.5 } }),
		...extra
	});
	/** Wrist travels `distance` frame widths over `ms`, starting at `from`. */
	const sweep = (distance: number, ms: number, from = 0.15) => {
		const n = Math.round(ms / MS);
		return Array.from({ length: n + 1 }, (_, i) => palm(from + (distance * i) / n));
	};
	const wipes = (out: Intents[]) => out.filter((o) => o.wipe).length;

	it('fires once for a fast rightward sweep', () => {
		expect(wipes(run(createModes(), sweep(0.7, 400)))).toBe(1);
	});

	it('fires for a leftward sweep and reports its direction', () => {
		const right = run(createModes(), sweep(0.7, 400)).find((o) => o.wipe);
		const left = run(createModes(), sweep(-0.7, 400, 0.85)).find((o) => o.wipe);
		expect([right?.wipeDir, left?.wipeDir]).toEqual([1, -1]);
	});

	it('ignores slow waving and short sweeps', () => {
		expect(wipes(run(createModes(), sweep(0.7, 1800)))).toBe(0);
		expect(wipes(run(createModes(), sweep(0.5, 300)))).toBe(0);
	});

	it('ignores a sweep with the drawing hand pinching', () => {
		const states = sweep(0.7, 400).map((s) => ({ ...s, drawing: reading({ pinching: true }) }));
		expect(wipes(run(createModes(), states))).toBe(0);
	});

	it('ignores a sweep while the hands cross', () => {
		const states = sweep(0.7, 400).map((s) => ({ ...s, crossing: true }));
		const out = run(createModes(), states);
		expect(wipes(out)).toBe(0);
		expect(out.every((o) => o.gust === 0)).toBe(true);
	});

	it('needs an open palm', () => {
		const states = sweep(0.7, 400).map((s) => hands({ ...s.off!, shape: 'two' }));
		expect(wipes(run(createModes(), states))).toBe(0);
	});

	it('respects the setting, read on every update', () => {
		let enabled = false;
		const modes = createModes({ sweepEnabled: () => enabled });
		expect(wipes(run(modes, sweep(0.7, 400)))).toBe(0);
		enabled = true;
		expect(wipes(run(modes, sweep(0.7, 400), 2000))).toBe(1);
	});

	it('waits out the cooldown, then fires again', () => {
		const modes = createModes();
		const first = wipes(run(modes, sweep(0.7, 400), 0));
		const during = wipes(run(modes, sweep(-0.7, 400, 0.85), 600));
		const after = wipes(run(modes, sweep(-0.7, 400, 0.85), 3000));
		expect([first, during, after]).toEqual([1, 0, 1]);
	});
});

describe('two-hand zoom and pan', () => {
	const pair = (a: [number, number], b: [number, number], crossing = false): HandsState => ({
		drawing: reading({ id: 1, pinching: true, pointer: { x: a[0], y: a[1] } }),
		off: reading({ id: 2, pinching: true, pointer: { x: b[0], y: b[1] } }),
		crossing
	});

	it('cancels the drawing action on entry, then reports factor and midpoint', () => {
		const modes = createModes();
		const [enter, grow] = run(modes, [
			pair([0.4, 0.5], [0.6, 0.5]),
			pair([0.375, 0.5], [0.625, 0.5])
		]);
		expect(enter).toMatchObject({ mode: 'zoom', cancel: true, view: null, pinching: false });
		expect(grow.cancel).toBe(false);
		expect(grow.view!.factor).toBeCloseTo(1.25);
		expect(grow.view).toMatchObject({ cx: 500, cy: 250, dx: 0, dy: 0 });
	});

	it('uses stage pixels for the span and the pan', () => {
		const modes = createModes();
		const [, step] = run(modes, [pair([0.4, 0.4], [0.6, 0.4]), pair([0.5, 0.5], [0.7, 0.5])]);
		expect(step.view!.factor).toBeCloseTo(1);
		expect(step.view).toMatchObject({ cx: 600, cy: 250, dx: 100, dy: 50 });
	});

	it('keeps the world point under the pinch fixed when applied to a View', () => {
		const modes = createModes();
		const view = new View();
		const states = [
			pair([0.4, 0.5], [0.6, 0.5]),
			pair([0.38, 0.5], [0.64, 0.5]),
			pair([0.35, 0.52], [0.66, 0.52])
		];
		const anchor = view.toWorld({ x: 500, y: 250 });
		for (const out of run(modes, states)) {
			if (!out.view) continue;
			view.panBy(out.view.dx, out.view.dy);
			view.zoomAt(out.view.factor, out.view.cx, out.view.cy);
		}
		const mid = view.toScreen(anchor);
		expect(mid.x).toBeCloseTo(0.505 * 1000, 0);
		expect(mid.y).toBeCloseTo(0.52 * 500, 0);
		expect(view.zoom).toBeCloseTo(0.31 / 0.2, 5);
	});

	it('limits the factor of a single frame', () => {
		const out = run(createModes(), [pair([0.4, 0.5], [0.6, 0.5]), pair([0.1, 0.5], [0.9, 0.5])]);
		expect(out[1].view!.factor).toBe(MODE_CONSTANTS.zoomMaxStep);
	});

	it('holds the factor steady when the pinches nearly touch', () => {
		const modes = createModes();
		const out = run(modes, [pair([0.5, 0.5], [0.501, 0.5]), pair([0.5, 0.5], [0.6, 0.5])]);
		expect(out[1].view!.factor).toBe(1);
	});

	it('requires the drawing hand to release before it acts again', () => {
		const modes = createModes();
		run(modes, [pair([0.4, 0.5], [0.6, 0.5]), pair([0.4, 0.5], [0.6, 0.5])]);
		const offOpen = { ...hands({ shape: 'none' }, { pinching: true }) };
		const during = run(modes, repeat(offOpen, 3), 100);
		expect(during.map((o) => o.pinching)).toEqual([false, false, false]);
		const released = run(modes, [hands({ shape: 'none' }, { pinching: false })], 200)[0];
		expect(released.pinching).toBe(false);
		const again = run(modes, [offOpen], 300)[0];
		expect(again.pinching).toBe(true);
	});

	it('does not need a release when the drawing hand was the one that let go', () => {
		const modes = createModes();
		run(modes, [pair([0.4, 0.5], [0.6, 0.5])]);
		run(modes, [hands({ pinching: true }, { pinching: false })], 100);
		expect(run(modes, [hands({}, { pinching: true })], 200)[0].pinching).toBe(true);
	});

	it('stays out of zoom while the hands cross, and ends it if they start to', () => {
		const modes = createModes();
		const crossed = run(modes, repeat(pair([0.4, 0.5], [0.45, 0.5], true), 3));
		expect(crossed.every((o) => o.mode !== 'zoom' && !o.view && !o.cancel)).toBe(true);

		const m2 = createModes();
		run(m2, [pair([0.4, 0.5], [0.6, 0.5]), pair([0.4, 0.5], [0.6, 0.5])]);
		const out = run(m2, [pair([0.4, 0.5], [0.6, 0.5], true)], 100)[0];
		expect(out).toMatchObject({ mode: 'none', view: null, pinching: false });
	});

	it('does not zoom for one pinching hand, and a lone off-hand pinch does nothing', () => {
		const out = last(run(createModes(), repeat(hands({ shape: 'pinch', pinching: true }), 3)));
		expect(out).toMatchObject({ mode: 'none', view: null, cancel: false, pinching: false });
	});
});
