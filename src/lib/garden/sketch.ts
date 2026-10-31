import type p5 from 'p5';
import type { Scene } from '#lib/scene/scene.svelte.js';
import { drawGarden } from './art.js';
import { renderThumbnails } from './thumbnails.svelte.js';

export function gardenSketch(scene: Scene) {
	const clock = { sway: 0, times: new Map<string, number>(), lean: new Map<string, number>() };
	return (p: p5) => {
		p.setup = () => {
			p.createCanvas(100, 100);
			p.colorMode(p.HSB, 360, 100, 100, 1);
			renderThumbnails(p);
		};
		p.draw = () => {
			drawGarden(p, scene, clock);
			if (scene.draft && scene.draft.length > 1) {
				p.noFill();
				p.stroke(0, 0, 100, 0.6);
				p.strokeWeight(2);
				p.beginShape();
				for (const pt of scene.draft) p.vertex(pt.x * p.width, pt.y * p.height);
				p.endShape();
			}
			if (clock.times.size > scene.elements.length) {
				const live = new Set(scene.elements.map((e) => e.id));
				for (const id of clock.times.keys()) if (!live.has(id)) clock.times.delete(id);
			}
		};
	};
}
