// The garden's drawing code. The app draws with it, and the code view copies this file
// verbatim, so exported sketches run exactly what the app runs.
/** mulberry32: a tiny seeded generator, so each element draws the same way on every load. */
/**
 * @typedef {import('p5').default} P5
 * @typedef {{ id: string, kind: string, x: number, y: number, scale: number, rotation: number,
 *   seed: number, hue: number, vividness: number, density: number, speed: number,
 *   brush?: string, path?: number[] }} Plant
 * @typedef {{ mood: { backdrop: string, wind: number, glow: boolean }, elements: Plant[] }} Garden
 */

/** @param {number} seed */
export function seeded(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
/** Saturation scaled by the element's vividness, capped at 100. */
/** @param {Plant} el @param {number} s */
export function sat(el, s) {
	return Math.min(100, s * el.vividness);
}
/** Points and unit normals along a painted path, scaled to radius `r`. */
/** @param {number[]} path @param {number} r */
export function walk(path, r) {
	const n = path.length / 2;
	/** @type {{ x: number, y: number, nx: number, ny: number }[]} */
	const out = [];
	for (let i = 0; i < n; i++) {
		const a = Math.max(0, i - 1);
		const b = Math.min(n - 1, i + 1);
		const dx = path[2 * b] - path[2 * a];
		const dy = path[2 * b + 1] - path[2 * a + 1];
		const len = Math.hypot(dx, dy) || 1;
		out.push({ x: path[2 * i] * r, y: path[2 * i + 1] * r, nx: -dy / len, ny: dx / len });
	}
	return out;
}
/** @param {P5} p @param {Plant} el @param {number} r @param {number} t */
export function drawBloom(p, el, r, t) {
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
/** @param {P5} p @param {Plant} el @param {number} r @param {number} t */
export function drawSwarm(p, el, r, t) {
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
/** @param {P5} p @param {Plant} el @param {number} r @param {number} t */
export function drawRibbon(p, el, r, t) {
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
/** @param {P5} p @param {Plant} el @param {number} r @param {number} t */
export function drawTree(p, el, r, t) {
	const rand = seeded(el.seed);
	const depth = Math.max(4, Math.min(9, Math.round((6 + Math.floor(rand() * 2)) * el.density)));
	const spread = 0.35 + rand() * 0.25;
	const sway = 0.06 * Math.sin(t * 0.8);
	/** @param {number} len @param {number} d */
	const branch = (len, d) => {
		p.stroke((el.hue + 20 + (depth - d) * 4) % 360, sat(el, 35), 60 + (depth - d) * 5, 0.9);
		p.strokeWeight(Math.max(1, d * 0.9));
		p.line(0, 0, 0, -len);
		p.translate(0, -len);
		if (d <= 1) {
			p.noStroke();
			p.fill(el.hue, sat(el, 70), 100, 0.85);
			p.circle(0, 0, r * 0.07);
			return;
		}
		for (const side of [-1, 1]) {
			p.push();
			p.rotate(side * spread + sway * (depth - d + 1));
			branch(len * 0.72, d - 1);
			p.pop();
		}
	};
	p.push();
	p.translate(0, r * 0.95);
	branch(r * 0.55, depth);
	p.pop();
}
/** @param {P5} p @param {Plant} el @param {number} r @param {number} t */
export function drawFireflies(p, el, r, t) {
	const rand = seeded(el.seed);
	const count = Math.round((14 + Math.floor(rand() * 10)) * el.density);
	const off = rand() * 1000;
	p.noStroke();
	for (let i = 0; i < count; i++) {
		const x = (p.noise(off + i * 7.1, t * 0.15) - 0.5) * 2.2 * r;
		const y = (p.noise(off + i * 7.1 + 50, t * 0.15) - 0.5) * 2.2 * r;
		const blink = 0.5 + 0.5 * Math.sin(t * (1.5 + rand() * 2) + rand() * 6);
		p.fill(el.hue, sat(el, 70), 100, 0.12 * blink);
		p.circle(x, y, r * 0.22);
		p.fill(el.hue, sat(el, 40), 100, 0.4 + 0.6 * blink);
		p.circle(x, y, r * 0.05);
	}
}
/** @param {P5} p @param {Plant} el @param {number} r @param {number} t */
export function drawFlow(p, el, r, t) {
	const rand = seeded(el.seed);
	const lines = Math.round((22 + Math.floor(rand() * 10)) * el.density);
	const off = rand() * 1000;
	p.noFill();
	p.strokeWeight(1.4);
	for (let i = 0; i < lines; i++) {
		const a0 = rand() * Math.PI * 2;
		const d0 = Math.sqrt(rand()) * r * 0.85;
		let x = Math.cos(a0) * d0;
		let y = Math.sin(a0) * d0;
		p.stroke((el.hue + (i % 6) * 6) % 360, sat(el, 60), 100, 0.55);
		p.beginShape();
		for (let step = 0; step < 18; step++) {
			p.vertex(x, y);
			const angle = p.noise(off + x / r, y / r, t * 0.12) * Math.PI * 4;
			x += Math.cos(angle) * r * 0.05;
			y += Math.sin(angle) * r * 0.05;
			if (x * x + y * y > r * r) break;
		}
		p.endShape();
	}
}
/** @param {P5} p @param {Plant} el @param {number} r @param {number} t */
export function drawStroke(p, el, r, t) {
	const pts = walk(el.path ?? [], r);
	if (pts.length < 2) return;
	const rand = seeded(el.seed);
	if (el.brush === 'shimmer') {
		p.noStroke();
		const per = Math.max(1, Math.round(2 * el.density));
		pts.forEach((pt, i) => {
			for (let k = 0; k < per; k++) {
				const jitter = (rand() - 0.5) * r * 0.12;
				const twinkle = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.7 + k * 2);
				p.fill((el.hue + k * 12) % 360, sat(el, 45), 100, 0.25 + 0.75 * twinkle);
				p.circle(pt.x + pt.nx * jitter, pt.y + pt.ny * jitter, 1.5 + twinkle * r * 0.035);
			}
		});
		return;
	}
	if (el.brush === 'silk') {
		const strands = Math.max(1, Math.round(4 * el.density));
		const off = rand() * 1000;
		p.noFill();
		for (let s = 0; s < strands; s++) {
			p.stroke((el.hue + s * 8) % 360, sat(el, 55), 100, 0.55);
			p.strokeWeight(1.2);
			p.beginShape();
			pts.forEach((pt, i) => {
				const d = (p.noise(off + i * 0.08, s * 0.7, t * 0.4) - 0.5) * r * 0.3;
				p.vertex(pt.x + pt.nx * d, pt.y + pt.ny * d);
			});
			p.endShape();
		}
		return;
	}
	const swayed = pts.map((pt, i) => {
		const d = Math.sin(t * 1.2 + i * 0.25) * r * 0.03 * (i / pts.length);
		return { ...pt, x: pt.x + pt.nx * d, y: pt.y + pt.ny * d };
	});
	p.noFill();
	p.stroke((el.hue + 10) % 360, sat(el, 50), 70, 0.95);
	p.strokeWeight(2.5);
	p.beginShape();
	for (const pt of swayed) p.vertex(pt.x, pt.y);
	p.endShape();
	const every = Math.max(2, Math.round(6 / el.density));
	p.noStroke();
	swayed.forEach((pt, i) => {
		if (i % every !== 0 || i === 0) return;
		const side = (i / every) % 2 ? 1 : -1;
		p.push();
		p.translate(pt.x, pt.y);
		p.rotate(Math.atan2(pt.ny * side, pt.nx * side));
		p.fill(el.hue, sat(el, 65), 90, 0.85);
		p.ellipse(r * 0.05, 0, r * 0.1, r * 0.045);
		p.pop();
	});
}
/** @type {Record<string, (p: P5, el: Plant, r: number, t: number) => void>} */
export const DRAW = {
	bloom: drawBloom,
	swarm: drawSwarm,
	ribbon: drawRibbon,
	tree: drawTree,
	fireflies: drawFireflies,
	flow: drawFlow,
	stroke: drawStroke
};
/** An element's radius at scale 1, as a fraction of the canvas's shorter side. */
export const BASE_RADIUS = 0.12;
/** @type {Record<string, { colors: [string, string], light: boolean }>} */
export const BACKDROPS = {
	night: { colors: ['#0b0f19', '#111827'], light: false },
	dusk: { colors: ['#1e1236', '#5a2a1f'], light: false },
	'deep-sea': { colors: ['#03141f', '#0b3a4a'], light: false },
	paper: { colors: ['#f5f0e6', '#ebe4d6'], light: true }
};
/**
 * Draws one frame of a garden: backdrop, then every element in order. `clock` holds each
 * element's own time and the shared sway time, so speed changes never jump.
 * @param {P5} p @param {Garden} garden
 * @param {{ sway: number, times: Map<string, number> }} clock
 */
export function drawGarden(p, garden, clock) {
	const width = p.width;
	const height = p.height;
	const dt = Math.min(p.deltaTime / 1000, 0.1);
	const backdrop = BACKDROPS[garden.mood.backdrop];
	const ctx = /** @type {CanvasRenderingContext2D} */ (p.drawingContext);
	const gradient = ctx.createLinearGradient(0, 0, 0, height);
	gradient.addColorStop(0, backdrop.colors[0]);
	gradient.addColorStop(1, backdrop.colors[1]);
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);
	p.blendMode(garden.mood.glow && !backdrop.light ? p.ADD : p.BLEND);
	clock.sway += dt;
	const unit = BASE_RADIUS * Math.min(width, height);
	for (const el of garden.elements) {
		const t = (clock.times.get(el.id) ?? 0) + dt * el.speed;
		clock.times.set(el.id, t);
		p.push();
		p.translate(el.x * width, el.y * height);
		const sway = garden.mood.wind * 0.3 * Math.sin(clock.sway * 0.9 + (el.seed % 628) / 100);
		p.rotate(el.rotation + sway);
		DRAW[el.kind](p, el, unit * el.scale, t);
		p.pop();
	}
	p.blendMode(p.BLEND);
}
