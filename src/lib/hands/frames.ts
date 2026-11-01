import type { Landmark } from './gesture.js';

export type Handedness = 'Left' | 'Right';

/** One detected hand, exactly as the tracker reported it. */
export interface RawHand {
	landmarks: Landmark[];
	label: Handedness;
	score: number;
}

/** One camera frame's detections: the input to everything after the tracker. */
export interface RawFrame {
	/** Milliseconds. */
	time: number;
	/** Frame width over height, for turning normalised landmarks into true distances. */
	aspect: number;
	hands: RawHand[];
}

/** The parts of MediaPipe's HandLandmarkerResult that the garden reads. */
export interface DetectionResult {
	landmarks: Landmark[][];
	handedness: { categoryName: string; score: number }[][];
}

export function toRawFrame(result: DetectionResult, aspect: number, time: number): RawFrame {
	return {
		time,
		aspect,
		hands: result.landmarks.map((landmarks, i) => {
			const category = result.handedness[i]?.[0];
			return {
				landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
				label: category?.categoryName === 'Left' ? 'Left' : 'Right',
				score: category?.score ?? 0
			};
		})
	};
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** A clip as JSON lines, one frame per line, rounded to keep recordings small. */
export function serializeClip(frames: readonly RawFrame[]): string {
	return frames
		.map((frame) =>
			JSON.stringify({
				time: round(frame.time),
				aspect: round(frame.aspect),
				hands: frame.hands.map((h) => ({
					label: h.label,
					score: round(h.score),
					landmarks: h.landmarks.map((p) => [round(p.x), round(p.y), round(p.z)])
				}))
			})
		)
		.join('\n')
		.concat('\n');
}

export function parseClip(text: string): RawFrame[] {
	return text
		.split('\n')
		.filter((line) => line.trim())
		.map((line) => {
			const frame = JSON.parse(line) as {
				time: number;
				aspect: number;
				hands: { label: Handedness; score: number; landmarks: [number, number, number][] }[];
			};
			return {
				time: frame.time,
				aspect: frame.aspect,
				hands: frame.hands.map((h) => ({
					label: h.label,
					score: h.score,
					landmarks: h.landmarks.map(([x, y, z]) => ({ x, y, z }))
				}))
			};
		});
}
