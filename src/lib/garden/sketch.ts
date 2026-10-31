import type p5 from 'p5';
import { elementRadius } from '#lib/scene/geometry.js';
import type { Scene } from '#lib/scene/scene.svelte.js';
import { BACKDROPS } from './backdrops.js';
import { KINDS } from './kinds.js';

export function gardenSketch(scene: Scene) {
	// Each element keeps its own clock, so changing its speed does not jump its animation.
	const clocks = new Map<string, number>();
	let swayClock = 0;
	return (p: p5) => {
		p.setup = () => {
			p.createCanvas(100, 100);
			p.colorMode(p.HSB, 360, 100, 100, 1);
		};
		p.draw = () => {
			// p5 2's width/height are getters; read them once per frame.
			const stage = { width: p.width, height: p.height };
			const dt = Math.min(p.deltaTime / 1000, 0.1);
			const backdrop = BACKDROPS[scene.mood.backdrop];
			const ctx = p.drawingContext as CanvasRenderingContext2D;
			const gradient = ctx.createLinearGradient(0, 0, 0, stage.height);
			gradient.addColorStop(0, backdrop.colors[0]);
			gradient.addColorStop(1, backdrop.colors[1]);
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, stage.width, stage.height);
			p.blendMode(scene.mood.glow && !backdrop.light ? p.ADD : p.BLEND);
			swayClock += dt;
			for (const el of scene.elements) {
				const t = (clocks.get(el.id) ?? 0) + dt * el.speed;
				clocks.set(el.id, t);
				p.push();
				p.translate(el.x * stage.width, el.y * stage.height);
				const sway = scene.mood.wind * 0.3 * Math.sin(swayClock * 0.9 + (el.seed % 628) / 100);
				p.rotate(el.rotation + sway);
				KINDS[el.kind].draw(p, el, elementRadius(el, stage), t);
				p.pop();
			}
			p.blendMode(p.BLEND);
			if (clocks.size > scene.elements.length) {
				const live = new Set(scene.elements.map((e) => e.id));
				for (const id of clocks.keys()) if (!live.has(id)) clocks.delete(id);
			}
		};
	};
}
