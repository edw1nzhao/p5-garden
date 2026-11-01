import type p5 from 'p5';
import type { Scene } from '#lib/scene/scene.svelte.js';
import { drawGarden } from './art.js';
import { renderThumbnails } from './thumbnails.svelte.js';
import { HAND_BONES } from '#lib/hands/gesture.js';
import type { View } from './view.svelte.js';
import { tracker } from '#lib/hands/tracker.svelte.js';

export function gardenSketch(scene: Scene, view: View) {
	const clock: {
		sway: number;
		times: Map<string, number>;
		lean: Map<string, number>;
		pointer?: { x: number; y: number };
		view?: { zoom: number; x: number; y: number };
	} = { sway: 0, times: new Map(), lean: new Map() };
	return (p: p5) => {
		p.setup = () => {
			p.createCanvas(100, 100);
			p.colorMode(p.HSB, 360, 100, 100, 1);
			renderThumbnails(p);
		};
		p.draw = () => {
			const hand = tracker.hand;
			clock.view = { zoom: view.zoom, x: view.x, y: view.y };
			clock.pointer = view.toWorld(
				hand
					? { x: hand.pointer.x * p.width, y: hand.pointer.y * p.height }
					: { x: p.mouseX, y: p.mouseY }
			);
			drawGarden(p, scene, clock);
			drawHands(p);
			if (scene.draft && scene.draft.length > 1) {
				p.push();
				p.translate(view.x, view.y);
				p.scale(view.zoom);
				p.noFill();
				p.stroke(0, 0, 100, 0.6);
				p.strokeWeight(2);
				p.beginShape();
				for (const pt of scene.draft) p.vertex(pt.x * p.width, pt.y * p.height);
				p.endShape();
				p.pop();
			}
			if (clock.times.size > scene.elements.length) {
				const live = new Set(scene.elements.map((e) => e.id));
				for (const id of clock.times.keys()) if (!live.has(id)) clock.times.delete(id);
			}
		};
	};
}

/** Draws each tracked hand's skeleton, and its pinch point filled while pinching. */
function drawHands(p: p5) {
	if (tracker.skeleton.length === 0) return;
	const w = p.width;
	const h = p.height;
	p.push();
	p.strokeWeight(2);
	for (const hand of tracker.skeleton) {
		p.stroke(0, 0, 100, 0.55);
		for (const [a, b] of HAND_BONES)
			p.line(hand[a].x * w, hand[a].y * h, hand[b].x * w, hand[b].y * h);
		p.noStroke();
		p.fill(0, 0, 100, 0.8);
		for (const pt of hand) p.circle(pt.x * w, pt.y * h, 6);
	}
	const pointer = tracker.hand;
	if (pointer) {
		p.stroke(240, 60, 100, 0.9);
		p.strokeWeight(2);
		if (pointer.pinching) p.fill(240, 60, 100, 0.6);
		else p.noFill();
		p.circle(pointer.pointer.x * w, pointer.pointer.y * h, 26);
	}
	p.pop();
}
