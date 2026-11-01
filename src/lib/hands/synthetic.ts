import type { Landmark } from './gesture.js';
import type { Handedness, RawHand } from './frames.js';

export type Pose = 'open' | 'point' | 'fist' | 'pinch';

export interface HandOptions {
	label?: Handedness;
	score?: number;
	/** Degrees, turning the hand about its wrist in the image plane. */
	roll?: number;
	/** Wrist to middle knuckle, in frame heights. */
	scale?: number;
	aspect?: number;
	/** Standard deviation of per-landmark jitter, in normalised units. */
	noise?: number;
	seed?: number;
}

type Point = [number, number, number];

// Hand-local units: wrist at the origin, fingers up (-y), wrist to middle knuckle = 1.
const KNUCKLES: Point[] = [
	[-0.25, -0.95, 0],
	[0, -1, 0],
	[0.22, -0.95, 0],
	[0.42, -0.85, 0]
];
const BONES = [
	[0.35, 0.25, 0.2],
	[0.4, 0.27, 0.22],
	[0.36, 0.25, 0.2],
	[0.28, 0.2, 0.18]
];
const CURL = [80, 170, 250].map((d) => (d * Math.PI) / 180);

/** A finger's three joints beyond its knuckle; curl 0 is straight, 1 folds it into the palm. */
function finger(base: Point, bones: number[], curl: number): Point[] {
	let [x, y, z] = base;
	return bones.map((length, i) => {
		const angle = CURL[i] * curl;
		y -= length * Math.cos(angle);
		z -= length * Math.sin(angle);
		return [x, y, z];
	});
}

function thumb(pose: Pose, indexTip: Point): Point[] {
	const cmc: Point = [-0.25, -0.15, 0];
	const mcp: Point = [-0.45, -0.35, 0];
	const tip: Point =
		pose === 'open'
			? [-0.75, -0.75, 0]
			: pose === 'pinch'
				? [indexTip[0] - 0.04, indexTip[1] + 0.02, indexTip[2]]
				: [-0.05, -0.6, -0.15];
	const ip: Point = [(mcp[0] + tip[0]) / 2 - 0.08, (mcp[1] + tip[1]) / 2, (mcp[2] + tip[2]) / 2];
	return [cmc, mcp, ip, tip];
}

function localHand(pose: Pose): Point[] {
	const curls: Record<Pose, number[]> = {
		open: [0, 0, 0, 0],
		point: [0, 1, 1, 1],
		fist: [1, 1, 1, 1],
		pinch: [0.45, 0.2, 0.2, 0.2]
	};
	const fingers = KNUCKLES.map((k, i) => [k, ...finger(k, BONES[i], curls[pose][i])]);
	return [[0, 0, 0], ...thumb(pose, fingers[0][3]), ...fingers.flat()];
}

/** Mulberry32: a small seeded generator, so synthetic noise is the same on every run. */
export function random(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A plausible MediaPipe hand with its wrist at `at` (normalised, unmirrored camera
 * coordinates), palm to the camera, in the given pose.
 */
export function hand(at: [number, number], pose: Pose, options: HandOptions = {}): RawHand {
	const { label = 'Right', score = 0.95, roll = 0, scale = 0.2, aspect = 4 / 3 } = options;
	const { noise = 0, seed = 1 } = options;
	const next = random(seed);
	const gauss = () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next());
	const mirror = label === 'Right' ? -1 : 1;
	const cos = Math.cos((roll * Math.PI) / 180);
	const sin = Math.sin((roll * Math.PI) / 180);
	const landmarks: Landmark[] = localHand(pose).map(([lx, ly, lz]) => {
		const x = lx * mirror;
		const rx = (x * cos - ly * sin) * scale;
		const ry = (x * sin + ly * cos) * scale;
		return {
			x: at[0] + rx / aspect + noise * gauss(),
			y: at[1] + ry + noise * gauss(),
			z: lz * scale
		};
	});
	return { landmarks, label, score };
}
