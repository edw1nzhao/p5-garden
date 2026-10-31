import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { gardenData, playgroundLink, p5Sketch, sketchBody, svelteComponent } from './codegen.js';

const garden = {
	mood: { backdrop: 'dusk' as const, wind: 0.4, glow: true },
	elements: [
		{
			id: 'bloom-1',
			kind: 'bloom' as const,
			x: 0.3,
			y: 0.4,
			scale: 1.2,
			rotation: 0.5,
			seed: 42,
			hue: 15,
			vividness: 1,
			density: 1,
			speed: 1
		},
		{
			id: 'stroke-2',
			kind: 'stroke' as const,
			brush: 'vine' as const,
			path: [-1, 0, 0, 0.2, 1, 0],
			x: 0.6,
			y: 0.6,
			scale: 1,
			rotation: 0,
			seed: 7,
			hue: 120,
			vividness: 1,
			density: 1,
			speed: 1
		}
	]
};

/** A stand-in for a p5 instance: every method is a no-op that records its name. */
function fakeP5() {
	const calls: string[] = [];
	const scales: number[] = [];
	const ctx = { createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
	const fixed: Record<string, unknown> = {
		width: 800,
		height: 600,
		deltaTime: 16,
		mouseX: 400,
		mouseY: 300,
		TWO_PI: Math.PI * 2,
		drawingContext: ctx,
		noise: () => 0.5
	};
	const p = new Proxy(fixed, {
		get: (target, key: string) =>
			key in target
				? target[key]
				: (...args: unknown[]) => {
						calls.push(key);
						if (key === 'scale') scales.push(args[0] as number);
					},
		set: (target, key: string, value) => ((target[key] = value), true)
	}) as Record<string, unknown> & { setup: () => void; draw: () => void };
	return { p, calls, scales };
}

describe('code generation', () => {
	it('keeps the garden data and rounds it for reading', () => {
		const data = gardenData({ ...garden, elements: [{ ...garden.elements[0], x: 0.333333333 }] });
		expect(data.elements[0].x).toBe(0.3333);
		expect(data.mood).toEqual(garden.mood);
	});

	it('produces a sketch body that runs and draws every plant', () => {
		const { p, calls } = fakeP5();
		new Function('p', sketchBody(garden))(p);
		p.setup();
		p.draw();
		expect(calls).toContain('createCanvas');
		expect(calls.filter((c) => c === 'translate')).toHaveLength(garden.elements.length);
	});

	it('wraps the body as a p5.js instance-mode sketch', () => {
		const code = p5Sketch(garden);
		expect(code).toMatch(/^import p5 from 'p5';/);
		expect(code).toContain('new p5((p) => {');
	});

	it('wraps the body as a svelte-p5 component that compiles', () => {
		const result = compile(svelteComponent(garden), { filename: 'Garden.svelte' });
		expect(result.warnings.map((w) => w.message)).toEqual([]);
		expect(result.js.code).toContain('svelte-p5');
	});

	it('links to the svelte-p5 playground with the body in the hash', async () => {
		const link = await playgroundLink(garden);
		expect(link).toMatch(/^https:\/\/svelte-p5\.dev\/playground#code=[A-Za-z0-9_-]+$/);
		const token = link.split('#code=')[1].replace(/-/g, '+').replace(/_/g, '/');
		const bytes = Uint8Array.from(atob(token + '='.repeat((4 - (token.length % 4)) % 4)), (c) =>
			c.charCodeAt(0)
		);
		const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
		expect(await new Response(stream).text()).toBe(sketchBody(garden));
	});

	it('draws plants near the pointer larger, and plants far away at their own size', () => {
		const run = (x: number) => {
			const { p, scales } = fakeP5();
			new Function(
				'p',
				sketchBody({ ...garden, elements: [{ ...garden.elements[0], x, y: 0.5 }] })
			)(p);
			p.setup();
			for (let i = 0; i < 30; i++) p.draw();
			return scales.at(-1)!;
		};
		expect(run(0.5)).toBeGreaterThan(1.05);
		expect(run(0.05)).toBe(1);
	});
});
