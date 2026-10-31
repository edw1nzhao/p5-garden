import artSource from './art.js?raw';
import type { GardenElement, Mood } from '#lib/scene/scene.svelte.js';

export interface GardenSnapshot {
	mood: Mood;
	elements: readonly GardenElement[];
}

const PLAYGROUND = 'https://svelte-p5.dev/playground';

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

/** The garden as plain data, rounded so the generated code stays readable. */
export function gardenData(garden: GardenSnapshot) {
	return {
		mood: { ...garden.mood },
		elements: garden.elements.map((el) => ({
			...el,
			x: round(el.x, 4),
			y: round(el.y, 4),
			scale: round(el.scale, 3),
			rotation: round(el.rotation, 3),
			vividness: round(el.vividness, 2),
			density: round(el.density, 2),
			speed: round(el.speed, 2),
			...(el.path ? { path: el.path.map((v) => round(v, 3)) } : {})
		}))
	};
}

/** art.js without its module syntax, so it runs inside a sketch function. */
const art = artSource
	.replace(/^\/\/.*\n\/\/.*\n/, '')
	.replace(/^export /gm, '')
	.trim();

function indent(code: string, tabs: number) {
	const pad = '\t'.repeat(tabs);
	return code
		.split('\n')
		.map((line) => (line ? pad + line : line))
		.join('\n');
}

/** The body of a sketch function `(p) => { ... }`: drawing code, garden data, setup and draw. */
export function sketchBody(garden: GardenSnapshot) {
	return `// A p5 garden, exported from p5-garden. Edit the data or the drawing code and run it again.

${art}

const garden = ${JSON.stringify(gardenData(garden), null, '\t')};
const clock = { sway: 0, times: new Map() };

p.setup = () => {
	p.createCanvas(800, 600);
	p.colorMode(p.HSB, 360, 100, 100, 1);
	p.describe('A generative garden of ${garden.elements.length} plants.');
};

p.draw = () => drawGarden(p, garden, clock);
`;
}

export function p5Sketch(garden: GardenSnapshot) {
	return `import p5 from 'p5';

new p5((p) => {
${indent(sketchBody(garden).trimEnd(), 1)}
});
`;
}

export function svelteComponent(garden: GardenSnapshot) {
	return `<script>
	import { P5Canvas } from 'svelte-p5';

	/** @param {import('p5').default} p */
	const sketch = (p) => {
${indent(sketchBody(garden).trimEnd(), 2)}
	};
</script>

<P5Canvas {sketch} />
`;
}

function toBase64Url(bytes: Uint8Array) {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A svelte-p5.dev playground link that opens this garden's sketch, ready to run. */
export async function playgroundLink(garden: GardenSnapshot) {
	const stream = new Blob([new TextEncoder().encode(sketchBody(garden))])
		.stream()
		.pipeThrough(new CompressionStream('deflate-raw'));
	const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
	return `${PLAYGROUND}#code=${toBase64Url(bytes)}`;
}
