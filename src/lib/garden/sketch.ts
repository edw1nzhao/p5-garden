import type p5 from 'p5';
import { elementRadius } from '#lib/scene/geometry.js';
import type { Scene } from '#lib/scene/scene.svelte.js';
import { KINDS } from './kinds.js';

export function gardenSketch(scene: Scene) {
	// Each element keeps its own clock, so changing its speed does not jump its animation.
	const clocks = new Map<string, number>();
	return (p: p5) => {
		p.setup = () => {
			p.createCanvas(100, 100);
			p.colorMode(p.HSB, 360, 100, 100, 1);
		};
		p.draw = () => {
			// p5 2's width/height are getters; read them once per frame.
			const stage = { width: p.width, height: p.height };
			const dt = Math.min(p.deltaTime / 1000, 0.1);
			p.background(228, 45, 9);
			for (const el of scene.elements) {
				const t = (clocks.get(el.id) ?? 0) + dt * el.speed;
				clocks.set(el.id, t);
				p.push();
				p.translate(el.x * stage.width, el.y * stage.height);
				p.rotate(el.rotation);
				KINDS[el.kind].draw(p, el, elementRadius(el, stage), t);
				p.pop();
			}
			if (clocks.size > scene.elements.length) {
				const live = new Set(scene.elements.map((e) => e.id));
				for (const id of clocks.keys()) if (!live.has(id)) clocks.delete(id);
			}
		};
	};
}
