import { describe, expect, it } from 'vitest';
import { Scene } from './scene.svelte.js';

describe('Scene', () => {
	it('adds an element at a point, selects it and puts it on top', () => {
		const scene = new Scene(() => 0.5);
		const a = scene.add('bloom', 0.2, 0.3);
		const b = scene.add('swarm', 0.4, 0.5);
		expect(scene.elements.map((e) => e.id)).toEqual([a, b]);
		expect(scene.selected?.id).toBe(b);
		expect(scene.elements[0]).toMatchObject({
			kind: 'bloom',
			x: 0.2,
			y: 0.3,
			scale: 1,
			rotation: 0
		});
	});

	it('keeps moved elements on the stage', () => {
		const scene = new Scene();
		const id = scene.add('ribbon', 0.5, 0.5);
		scene.move(id, 1.4, -0.2);
		expect(scene.elements[0]).toMatchObject({ x: 1, y: 0 });
	});

	it('clamps scale to a usable range', () => {
		const scene = new Scene();
		const id = scene.add('bloom', 0.5, 0.5);
		scene.transform(id, { scale: 99, rotation: 1 });
		expect(scene.elements[0]).toMatchObject({ scale: 3, rotation: 1 });
		scene.transform(id, { scale: 0 });
		expect(scene.elements[0].scale).toBe(0.3);
	});

	it('raises, removes and deselects', () => {
		const scene = new Scene();
		const a = scene.add('bloom', 0.1, 0.1);
		const b = scene.add('swarm', 0.2, 0.2);
		scene.raise(a);
		expect(scene.elements.map((e) => e.id)).toEqual([b, a]);
		scene.select(a);
		scene.remove(a);
		expect(scene.elements.map((e) => e.id)).toEqual([b]);
		expect(scene.selected).toBeNull();
	});
});
