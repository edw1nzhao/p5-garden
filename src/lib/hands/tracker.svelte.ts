import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandState } from './gesture.js';
import { serializeClip, toRawFrame, type RawFrame } from './frames.js';
import { createPipeline, type Pipeline } from './pipeline.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm';
const MODEL =
	'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

type Status = 'off' | 'loading' | 'on' | 'error';

/** Webcam hand tracking with MediaPipe, entirely in the browser; nothing is uploaded. */
export class HandTracker {
	status = $state<Status>('off');
	message = $state('');
	/** The first hand seen, as a pointer and pinch state. */
	hand = $state<HandState | null>(null);
	/** Every tracked hand's 21 points, mirrored, as fractions of the canvas. */
	skeleton = $state.raw<{ x: number; y: number }[][]>([]);

	#video: HTMLVideoElement | null = null;
	#stream: MediaStream | null = null;
	#landmarker: HandLandmarker | null = null;
	#frame = 0;
	#lastTime = -1;
	#pipeline: Pipeline = createPipeline();
	/** Frames kept for download when the page is opened with ?record-hands. */
	#recording: RawFrame[] | null = null;

	async start(video: HTMLVideoElement) {
		if (this.status === 'loading' || this.status === 'on') return;
		this.status = 'loading';
		this.message = '';
		try {
			this.#video = video;
			this.#stream = await navigator.mediaDevices.getUserMedia({
				video: { width: 640, height: 480, facingMode: 'user' },
				audio: false
			});
			video.srcObject = this.#stream;
			await video.play();
			const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
			const fileset = await FilesetResolver.forVisionTasks(WASM);
			this.#landmarker = await HandLandmarker.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
				runningMode: 'VIDEO',
				numHands: 2
			});
			if (!this.#stream) return;
			this.#pipeline = createPipeline();
			this.#recording = new URLSearchParams(location.search).has('record-hands') ? [] : null;
			this.status = 'on';
			this.#frame = requestAnimationFrame(this.#tick);
		} catch (error) {
			this.stop();
			this.status = 'error';
			this.message = explain(error);
		}
	}

	stop() {
		cancelAnimationFrame(this.#frame);
		this.#stream?.getTracks().forEach((track) => track.stop());
		this.#stream = null;
		this.#landmarker?.close();
		this.#landmarker = null;
		if (this.#video) this.#video.srcObject = null;
		this.#lastTime = -1;
		if (this.#recording?.length) download(serializeClip(this.#recording));
		this.#recording = null;
		this.hand = null;
		this.skeleton = [];
		this.status = 'off';
	}

	#tick = () => {
		const video = this.#video;
		const landmarker = this.#landmarker;
		if (!video || !landmarker) return;
		if (video.currentTime !== this.#lastTime && video.readyState >= 2) {
			this.#lastTime = video.currentTime;
			const aspect = video.videoWidth / video.videoHeight || 4 / 3;
			const now = performance.now();
			const frame = toRawFrame(landmarker.detectForVideo(video, now), aspect, now);
			this.#recording?.push(frame);
			this.skeleton = frame.hands.map((h) => h.landmarks.map((p) => ({ x: 1 - p.x, y: p.y })));
			this.hand = this.#pipeline(frame);
		}
		this.#frame = requestAnimationFrame(this.#tick);
	};
}

function download(text: string) {
	const link = document.createElement('a');
	link.href = URL.createObjectURL(new Blob([text], { type: 'application/jsonl' }));
	link.download = `hands-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(link.href));
}

function explain(error: unknown): string {
	const name = error instanceof DOMException ? error.name : '';
	if (name === 'NotAllowedError')
		return 'Camera access was blocked. Allow it in the browser to use your hands.';
	if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found.';
	return 'Hand tracking could not start on this device.';
}

export const tracker = new HandTracker();
