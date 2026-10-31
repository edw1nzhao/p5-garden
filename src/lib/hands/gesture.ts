/** One of MediaPipe's 21 hand landmarks, normalized to the camera frame. */
export interface Landmark {
	x: number;
	y: number;
	z: number;
}

export interface HandState {
	/** Between thumb and index tips, as fractions of the canvas, mirrored like a selfie. */
	pointer: { x: number; y: number };
	pinching: boolean;
}

export type HandEvent = 'hover' | 'down' | 'move' | 'up';

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const WRIST = 0;
const MIDDLE_KNUCKLE = 9;
// Fingertip gap as a share of hand size; different thresholds to start and end stop flicker.
const PINCH_START = 0.3;
const PINCH_END = 0.45;

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

export function readHand(landmarks: readonly Landmark[], wasPinching: boolean): HandState {
	const thumb = landmarks[THUMB_TIP];
	const index = landmarks[INDEX_TIP];
	const size = dist(landmarks[WRIST], landmarks[MIDDLE_KNUCKLE]) || 1;
	const gap = dist(thumb, index) / size;
	return {
		pointer: { x: 1 - (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 },
		pinching: gap < (wasPinching ? PINCH_END : PINCH_START)
	};
}

/** What a change in hand state means for the canvas, in pointer terms. */
export function handEvent(prev: HandState | null, next: HandState | null): HandEvent | null {
	if (!next) return prev?.pinching ? 'up' : null;
	if (next.pinching) return prev?.pinching ? 'move' : 'down';
	return prev?.pinching ? 'up' : 'hover';
}

/** Pairs of landmark indices that form the hand's bones, for drawing its skeleton. */
export const HAND_BONES: readonly [number, number][] = [
	[0, 1],
	[1, 2],
	[2, 3],
	[3, 4],
	[0, 5],
	[5, 6],
	[6, 7],
	[7, 8],
	[5, 9],
	[9, 10],
	[10, 11],
	[11, 12],
	[9, 13],
	[13, 14],
	[14, 15],
	[15, 16],
	[13, 17],
	[0, 17],
	[17, 18],
	[18, 19],
	[19, 20]
];
