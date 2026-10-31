import type p5 from 'p5';
import type { ElementKind, GardenElement } from '#lib/scene/scene.svelte.js';
import { seeded } from './rng.js';

export interface Kind {
	label: string;
	/** Short phrase for the canvas description. */
	noun: string;
	/** Draws in the element's frame: centred at 0,0, radius `r`, rotation already applied. */
	draw(p: p5, el: GardenElement, r: number, t: number): void;
}

const bloom: Kind = {
	label: 'Bloom',
	noun: 'bloom',
	draw(p, el, r, t) {
		const rand = seeded(el.seed);
		const petals = Math.max(3, Math.round((5 + Math.floor(rand() * 6)) * el.density));
		const layers = 3 + Math.floor(rand() * 3);
		const spin = (rand() - 0.5) * 0.4;
		const breathe = 1 + 0.06 * Math.sin(t * 1.3 + rand() * 6);
		p.noStroke();
		for (let layer = layers; layer >= 1; layer--) {
			const lr = (r * layer * breathe) / layers;
			p.fill((el.hue + layer * 7) % 360, sat(el, 55 + layer * 8), 95, 0.55);
			for (let i = 0; i < petals; i++) {
				const a = (i / petals) * p.TWO_PI + t * spin * (layer % 2 ? 1 : -1);
				p.push();
				p.rotate(a);
				p.ellipse(lr * 0.5, 0, lr, lr * 0.42);
				p.pop();
			}
		}
		p.fill((el.hue + 30) % 360, sat(el, 35), 100, 0.95);
		p.circle(0, 0, r * 0.22);
	}
};

const swarm: Kind = {
	label: 'Swarm',
	noun: 'swarm',
	draw(p, el, r, t) {
		const rand = seeded(el.seed);
		const count = Math.round((40 + Math.floor(rand() * 40)) * el.density);
		p.noStroke();
		for (let i = 0; i < count; i++) {
			const phase = rand() * p.TWO_PI;
			const speed = 0.3 + rand() * 0.9;
			const n = p.noise(el.seed % 1000, i * 0.31, t * 0.25);
			const rr = r * (0.25 + 0.75 * n);
			const a = phase + t * speed;
			p.fill((el.hue + (i % 8) * 5) % 360, sat(el, 70), 100, 0.8);
			p.circle(Math.cos(a) * rr, Math.sin(a) * rr, 2 + rand() * r * 0.06);
		}
	}
};

const ribbon: Kind = {
	label: 'Ribbon',
	noun: 'ribbon',
	draw(p, el, r, t) {
		const rand = seeded(el.seed);
		const strands = Math.max(1, Math.round((4 + Math.floor(rand() * 4)) * el.density));
		const off = rand() * 1000;
		p.noFill();
		for (let s = 0; s < strands; s++) {
			p.stroke((el.hue + s * 8) % 360, sat(el, 65), 100, 0.7);
			p.strokeWeight(1.5 + s * 0.4);
			p.beginShape();
			for (let i = 0; i <= 48; i++) {
				const u = i / 48;
				const x = (u * 2 - 1) * r;
				const env = Math.sin(u * Math.PI);
				const y = (p.noise(off + u * 1.6, s * 0.4, t * 0.3) - 0.5) * 2 * r * env;
				p.vertex(x, y);
			}
			p.endShape();
		}
	}
};

/** Saturation scaled by the element's vividness, capped at 100. */
export const sat = (el: GardenElement, s: number) => Math.min(100, s * el.vividness);

export const KINDS: Record<ElementKind, Kind> = { bloom, swarm, ribbon };
export const KIND_ORDER: ElementKind[] = ['bloom', 'swarm', 'ribbon'];
