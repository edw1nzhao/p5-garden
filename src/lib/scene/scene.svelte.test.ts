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

	it('starts elements with neutral style settings', () => {
		const scene = new Scene(() => 0.5);
		scene.add('bloom', 0.5, 0.5);
		expect(scene.elements[0]).toMatchObject({ hue: 180, vividness: 1, density: 1, speed: 1 });
	});

	it('updates style settings within their ranges', () => {
		const scene = new Scene();
		const id = scene.add('swarm', 0.5, 0.5);
		scene.update(id, { hue: 400, vividness: 9, density: 0, speed: -1 });
		expect(scene.elements[0]).toMatchObject({ hue: 40, vividness: 1.5, density: 0.3, speed: 0 });
		scene.update(id, { hue: -30 });
		expect(scene.elements[0].hue).toBe(330);
	});

	it('re-rolls an element into a new seed', () => {
		const values = [0.1, 0.2, 0.9];
		const scene = new Scene(() => values.shift() ?? 0);
		const id = scene.add('ribbon', 0.5, 0.5);
		const before = scene.elements[0].seed;
		scene.reroll(id);
		expect(scene.elements[0].seed).not.toBe(before);
	});

	it('starts with a calm night mood and keeps mood settings in range', () => {
		const scene = new Scene();
		expect(scene.mood).toEqual({ backdrop: 'night', wind: 0, glow: false, react: false });
		scene.setMood({ backdrop: 'dusk', wind: 3, glow: true });
		expect(scene.mood).toEqual({ backdrop: 'dusk', wind: 1, glow: true, react: false });
		scene.setMood({ wind: -1 });
		expect(scene.mood.wind).toBe(0);
	});

	it('adds a painted stroke as a selectable element with its brush and path', () => {
		const scene = new Scene(() => 0.5);
		const id = scene.addStroke('vine', { x: 0.4, y: 0.6, scale: 1.2, path: [-1, 0, 1, 0] });
		expect(scene.selected).toMatchObject({
			id,
			kind: 'stroke',
			brush: 'vine',
			x: 0.4,
			y: 0.6,
			scale: 1.2,
			path: [-1, 0, 1, 0]
		});
	});

	it('undoes and redoes discrete changes', () => {
		const scene = new Scene();
		scene.add('bloom', 0.2, 0.2);
		scene.add('swarm', 0.4, 0.4);
		expect(scene.canUndo).toBe(true);
		scene.undo();
		expect(scene.elements.map((e) => e.kind)).toEqual(['bloom']);
		scene.undo();
		expect(scene.elements).toEqual([]);
		expect(scene.canUndo).toBe(false);
		scene.redo();
		scene.redo();
		expect(scene.elements.map((e) => e.kind)).toEqual(['bloom', 'swarm']);
		expect(scene.canRedo).toBe(false);
	});

	it('merges a burst of changes to one plant into a single undo step', () => {
		let now = 0;
		const scene = new Scene(Math.random, () => now);
		const id = scene.add('bloom', 0.5, 0.5);
		for (let i = 1; i <= 20; i++) {
			now += 16;
			scene.move(id, 0.5 + i * 0.01, 0.5);
		}
		now += 2000;
		scene.update(id, { hue: 10 });
		scene.undo();
		expect(scene.elements[0].x).toBeCloseTo(0.7);
		scene.undo();
		expect(scene.elements[0]).toMatchObject({ x: 0.5, y: 0.5 });
	});

	it('drops the redo history when a new change is made', () => {
		const scene = new Scene();
		scene.add('bloom', 0.5, 0.5);
		scene.undo();
		scene.add('tree', 0.5, 0.5);
		expect(scene.canRedo).toBe(false);
		expect(scene.elements.map((e) => e.kind)).toEqual(['tree']);
	});

	it('restores the mood and keeps the selection only if its plant still exists', () => {
		const scene = new Scene();
		const id = scene.add('bloom', 0.5, 0.5);
		scene.setMood({ backdrop: 'paper' });
		scene.undo();
		expect(scene.mood.backdrop).toBe('night');
		expect(scene.selectedId).toBe(id);
		scene.undo();
		expect(scene.selectedId).toBeNull();
	});

	it('gives a painted stroke the hue it was painted with', () => {
		const scene = new Scene(() => 0.5);
		scene.addStroke('silk', { x: 0.4, y: 0.6, scale: 1, path: [-1, 0, 1, 0] }, 345);
		scene.addStroke('silk', { x: 0.4, y: 0.6, scale: 1, path: [-1, 0, 1, 0] });
		expect(scene.elements.map((e) => e.hue)).toEqual([345, 180]);
	});

	it('adds several strokes as one undo step', () => {
		const scene = new Scene();
		const shape = { x: 0.3, y: 0.5, scale: 1, path: [-1, 0, 1, 0] };
		scene.add('bloom', 0.5, 0.5);
		const ids = scene.addStrokes([
			{ brush: 'vine', shape, hue: 30 },
			{ brush: 'vine', shape: { ...shape, x: 0.7 }, hue: 30 }
		]);
		expect(ids).toHaveLength(2);
		expect(scene.elements.map((e) => e.x)).toEqual([0.5, 0.3, 0.7]);
		expect(scene.selectedId).toBe(ids[1]);
		scene.undo();
		expect(scene.elements.map((e) => e.kind)).toEqual(['bloom']);
		expect(scene.addStrokes([])).toEqual([]);
	});

	it('clears the garden as one undo step and restores it on undo and redo', () => {
		const scene = new Scene();
		scene.add('bloom', 0.2, 0.2);
		scene.add('swarm', 0.4, 0.4);
		scene.addStroke('vine', { x: 0.5, y: 0.5, scale: 1, path: [-1, 0, 1, 0] });
		scene.setMood({ wind: 0.5 });
		expect(scene.clear()).toBe(true);
		expect(scene.elements).toEqual([]);
		expect(scene.selected).toBeNull();
		expect(scene.mood.wind).toBe(0.5);
		scene.undo();
		expect(scene.elements.map((e) => e.kind)).toEqual(['bloom', 'swarm', 'stroke']);
		scene.redo();
		expect(scene.elements).toEqual([]);
	});

	it('does nothing, and records nothing, when clearing an empty garden', () => {
		const scene = new Scene();
		expect(scene.clear()).toBe(false);
		expect(scene.canUndo).toBe(false);
	});
});
