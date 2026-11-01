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
	confidence: 1,
	measures: { fingers: [1, 1, 1, 1], thumb: 0.5 },
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
		const still = last(move(createModes(), 0, 20));
		const slow = last(move(createModes(), 0.5, 20));
		const fast = last(move(createModes(), 1.2, 20));
		expect(still.gust).toBe(0);
		expect(slow.gust).toBeGreaterThan(0.05);
		expect(fast.gust).toBeGreaterThan(slow.gust);
		expect(fast.gust).toBeLessThanOrEqual(MODE_CONSTANTS.gustMax);
	});

	it('decays smoothly after the hand stops, even with no further updates', () => {
		const modes = createModes();
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

describe('hold both palms open to clear', () => {
	const C = MODE_CONSTANTS;
	const palms = (dx = 0, dy = 0, extra: Partial<HandsState> = {}): HandsState => ({
		...hands(
			{ shape: 'open', wrist: { x: 0.7 + dx, y: 0.6 + dy } },
			{ shape: 'open', wrist: { x: 0.3 - dx, y: 0.6 + dy } }
		),
		...extra
	});
	const frames = (ms: number) => Math.ceil(ms / MS) + 1;
	const hold = (ms = C.clearHoldMs + 100) => repeat(palms(), frames(ms));
	const wipes = (out: Intents[]) => out.filter((o) => o.wipe).length;

	it('fires once after the hold, not before', () => {
		const out = run(createModes(), hold());
		const first = out.findIndex((o) => o.wipe);
		expect(wipes(out)).toBe(1);
		expect(first * MS).toBeGreaterThanOrEqual(C.clearHoldMs);
		expect(first * MS).toBeLessThan(C.clearHoldMs + 2 * MS);
	});

	it('reports progress rising towards 1 and back to 0 after firing', () => {
		const mid = last(run(createModes(), hold(C.clearHoldMs / 2))).clearProgress;
		expect(mid).toBeGreaterThan(0.4);
		expect(mid).toBeLessThan(0.6);
		expect(last(run(createModes(), hold())).clearProgress).toBe(0);
	});

	it('tolerates small wrist jitter but restarts when either hand moves too far', () => {
		const jitter = Array.from({ length: frames(C.clearHoldMs + 100) }, (_, i) =>
			palms((i % 2 ? 1 : -1) * C.clearMoveTolerance * 0.3)
		);
		expect(wipes(run(createModes(), jitter))).toBe(1);
		const drift = Array.from({ length: frames(C.clearHoldMs + 100) }, (_, i) => palms(i * 0.005));
		const out = run(createModes(), drift);
		expect(wipes(out)).toBe(0);
		expect(last(out).clearProgress).toBeLessThan(0.5);
	});

	it('measures movement from where the hold began, so a slow creep still restarts', () => {
		const creep = Array.from({ length: frames(C.clearHoldMs + 100) }, (_, i) =>
			palms(0, i * 0.002)
		);
		expect(wipes(run(createModes(), creep))).toBe(0);
	});

	it('restarts the hold after a move', () => {
		const out = run(createModes(), [...hold(C.clearHoldMs * 0.7), palms(0.2), ...hold()]);
		expect(wipes(out)).toBe(1);
		expect(out.findIndex((o) => o.wipe) * MS).toBeGreaterThan(C.clearHoldMs * 1.5);
	});

	it.each<[string, (s: HandsState) => HandsState]>([
		['the off hand leaves open', (s) => hands({ ...s.off!, shape: 'two' }, s.drawing)],
		['the drawing hand leaves open', (s) => hands(s.off, { ...s.drawing!, shape: 'fist' })],
		['a hand drops out', (s) => hands(s.off, null)],
		[
			'the drawing hand pinches',
			(s) => hands(s.off, { ...s.drawing!, shape: 'pinch', pinching: true })
		],
		['the hands cross', (s) => ({ ...s, crossing: true })]
	])('cancels and resets when %s mid-hold', (_, change) => {
		const start = hold(C.clearHoldMs * 0.6);
		const broken = repeat(change(palms()), 3);
		const out = run(createModes(), [...start, ...broken, ...hold(C.clearHoldMs * 0.6)]);
		expect(wipes(out)).toBe(0);
		expect(out.slice(start.length, start.length + 3).every((o) => o.clearProgress === 0)).toBe(
			true
		);
	});

	it('needs both hands', () => {
		const one = repeat(hands({ shape: 'open' }, null), frames(C.clearHoldMs + 100));
		expect(wipes(run(createModes(), one))).toBe(0);
	});

	it('waits out the cooldown, then fires again', () => {
		const modes = createModes();
		const first = wipes(run(modes, hold(), 0));
		const during = wipes(run(modes, hold(C.clearHoldMs), C.clearHoldMs + 200));
		const after = wipes(run(modes, hold(), C.clearHoldMs + C.clearCooldownMs + 500));
		expect([first, during, after]).toEqual([1, 0, 1]);
	});

	it('does nothing while the garden is empty, and asks on every update', () => {
		let canClear = false;
		const modes = createModes({ canClear: () => canClear });
		const empty = run(modes, hold(), 0);
		expect(wipes(empty)).toBe(0);
		expect(empty.every((o) => o.clearProgress === 0)).toBe(true);
		canClear = true;
		expect(wipes(run(modes, hold(), 5000))).toBe(1);
	});

	it('is not triggered by a fast sweep of one open palm', () => {
		const sweep = Array.from({ length: 14 }, (_, i) =>
			hands({ shape: 'open', wrist: { x: 0.15 + i * 0.05, y: 0.5 } }, null)
		);
		expect(wipes(run(createModes(), sweep))).toBe(0);
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

describe('two-hand scale and rotate of a held plant', () => {
	const pair = (a: [number, number], b: [number, number], crossing = false): HandsState => ({
		drawing: reading({ id: 1, pinching: true, pointer: { x: a[0], y: a[1] } }),
		off: reading({ id: 2, pinching: true, pointer: { x: b[0], y: b[1] } }),
		crossing
	});
	const held = () => createModes({ grabbing: () => true });
	/** Two pinches `span` stage pixels apart, the line between them turned `deg` from horizontal. */
	const at = (span: number, deg: number): HandsState => {
		const r = (deg * Math.PI) / 180;
		const dx = (Math.cos(r) * span) / 2 / SIZE.width;
		const dy = (Math.sin(r) * span) / 2 / SIZE.height;
		return pair([0.5 - dx, 0.5 - dy], [0.5 + dx, 0.5 + dy]);
	};

	it('starts at scale 1 and no turn, cancels the grab, and does not move the view', () => {
		const [enter] = run(held(), [at(200, 0)]);
		expect(enter).toMatchObject({ mode: 'zoom', cancel: true, view: null, pinching: false });
		expect(enter.transform).toEqual({ scale: 1, rotation: 0 });
	});

	it('gives scale as an absolute ratio to the start, not a per-frame product', () => {
		const out = run(held(), [at(200, 0), at(300, 0), at(150, 0), at(400, 0)]);
		expect(out.map((o) => o.transform!.scale)).toEqual([1, 1.5, 0.75, 2]);
		expect(out.every((o) => o.view === null)).toBe(true);
	});

	it('gives rotation as the change in the angle between the pinches', () => {
		const out = run(held(), [at(200, 10), at(200, 40), at(200, -20)]);
		expect(out[1].transform!.rotation).toBeCloseTo((30 * Math.PI) / 180);
		expect(out[2].transform!.rotation).toBeCloseTo((-30 * Math.PI) / 180);
	});

	it('keeps turning the same way across the +/-180 degree seam', () => {
		const degrees = [170, 175, 180, -175, -170, -160];
		const out = run(
			held(),
			degrees.map((d) => at(200, d))
		);
		const turned = out.map((o) => (o.transform!.rotation * 180) / Math.PI);
		expect(turned[3]).toBeCloseTo(15);
		expect(turned[5]).toBeCloseTo(30);
		expect(turned.every((t, i) => i === 0 || t > turned[i - 1] - 1e-9)).toBe(true);
	});

	it('turns the other way across the seam without a jump', () => {
		const out = run(held(), [at(200, -170), at(200, -178), at(200, 175), at(200, 168)]);
		expect((last(out).transform!.rotation * 180) / Math.PI).toBeCloseTo(-22);
	});

	it('accumulates more than a full turn', () => {
		const degrees = Array.from({ length: 25 }, (_, i) => i * 20 - 180);
		const out = run(
			held(),
			degrees.map((d) => at(200, d))
		);
		expect((last(out).transform!.rotation * 180) / Math.PI).toBeCloseTo(480);
	});

	it('holds the angle and clamps the scale while the pinches nearly touch', () => {
		const out = run(held(), [at(200, 0), at(2, 90), at(200, 30)]);
		expect(out[1].transform!.scale).toBeCloseTo(MODE_CONSTANTS.zoomMinSpan / 200);
		expect(out[1].transform!.rotation).toBe(0);
		expect(out[2].transform!.rotation).toBeCloseTo((30 * Math.PI) / 180);
	});

	it('still zooms the canvas when the drawing hand was not on a plant', () => {
		const modes = createModes({ grabbing: () => false });
		const out = run(modes, [at(200, 0), at(300, 20)]);
		expect(out.every((o) => o.transform === null)).toBe(true);
		expect(out[1].view!.factor).toBeCloseTo(1.5);
	});

	it('asks whether a plant is held only when the two-pinch begins', () => {
		let calls = 0;
		const modes = createModes({ grabbing: () => (calls++, true) });
		run(modes, [at(200, 0), at(210, 0), at(220, 0)]);
		expect(calls).toBe(1);
	});

	it('ends when either hand releases, and the remaining pinch must release first', () => {
		const modes = held();
		run(modes, [at(200, 0), at(300, 0)]);
		const offLetGo = hands({ pinching: false }, { pinching: true });
		const ended = run(modes, repeat(offLetGo, 3), 100);
		expect(ended.every((o) => o.transform === null && !o.pinching)).toBe(true);
		const free = run(modes, [hands({ pinching: false }, { pinching: false })], 200)[0];
		expect(free.pinching).toBe(false);
		expect(run(modes, [hands({}, { pinching: true })], 300)[0].pinching).toBe(true);
	});

	it('starts afresh on the next gesture', () => {
		const modes = held();
		run(modes, [at(200, 0), at(400, 90)]);
		run(modes, [hands({}, { pinching: false })], 100);
		const [again, grow] = run(modes, [at(100, 45), at(150, 45)], 200);
		expect(again.transform).toEqual({ scale: 1, rotation: 0 });
		expect(grow.transform!.scale).toBeCloseTo(1.5);
		expect(grow.transform!.rotation).toBeCloseTo(0);
	});

	it('does nothing while the hands cross, and ends the transform if they start to', () => {
		const crossed = run(held(), repeat(pair([0.4, 0.5], [0.45, 0.5], true), 3));
		expect(crossed.every((o) => o.transform === null && !o.cancel)).toBe(true);
		const modes = held();
		run(modes, [at(200, 0), at(220, 0)]);
		const out = run(modes, [pair([0.4, 0.5], [0.6, 0.5], true)], 100)[0];
		expect(out).toMatchObject({ mode: 'none', transform: null, view: null, pinching: false });
	});

	it('needs both pinches', () => {
		const out = last(run(held(), repeat(hands({ pinching: false }, { pinching: true }), 3)));
		expect(out.transform).toBeNull();
	});
});
