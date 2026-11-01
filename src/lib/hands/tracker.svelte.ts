import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { settings } from '../settings.svelte.js';
import { serializeClip, toRawFrame, type RawFrame } from './frames.js';
import { createPipeline, NO_HANDS, type HandsState, type Pipeline } from './pipeline.js';
import { createWithFallback, FrameStats, type Delegate } from './timing.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm';
const MODEL =
	'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

type Status = 'off' | 'loading' | 'on' | 'error';

/** Webcam hand tracking with MediaPipe, entirely in the browser; nothing is uploaded. */
export class HandTracker {
	status = $state<Status>('off');
	message = $state('');
	/** Both tracked hands by role: pointer, pinch, debounced shape, wrist and openness. */
	hands = $state.raw<HandsState>(NO_HANDS);
	/** The drawing hand, for code that only needs a pointer and a pinch. */
	hand = $derived(this.hands.drawing);
	/** Every tracked hand's 21 points, mirrored, as fractions of the canvas. */
	skeleton = $state.raw<{ x: number; y: number }[][]>([]);
	/** MediaPipe's label and score for each hand, shown with ?debug-hands. */
	labels = $state.raw<string[] | null>(null);
	/** Delegate, detect time and dropped frames, shown with ?debug-hands. */
	stats = $state('');

	#video: HTMLVideoElement | null = null;
	#stream: MediaStream | null = null;
	#landmarker: HandLandmarker | null = null;
	#frame = 0;
	#usingVfc = false;
	#lastTime = -1;
	#delegate: Delegate = 'GPU';
	#frameStats = new FrameStats();
	#statsShownAt = 0;
	#pipeline: Pipeline = createPipeline({ drawingHand: settings.drawingHand });
	#pipelineHand = settings.drawingHand;
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
			const { value, delegate } = await createWithFallback((delegate) =>
				HandLandmarker.createFromOptions(fileset, {
					baseOptions: { modelAssetPath: MODEL, delegate },
					runningMode: 'VIDEO',
					numHands: 2
				})
			);
			if (!this.#stream) return value.close();
			this.#landmarker = value;
			this.#delegate = delegate;
			this.#frameStats = new FrameStats();
			this.#lastTime = -1;
			this.#rebuildPipeline();
			const params = new URLSearchParams(location.search);
			this.#recording = params.has('record-hands') ? [] : null;
			this.labels = params.has('debug-hands') ? [] : null;
			this.status = 'on';
			this.#usingVfc = 'requestVideoFrameCallback' in video;
			this.#schedule();
		} catch (error) {
			this.stop();
			this.status = 'error';
			this.message = explain(error);
		}
	}

	stop() {
		if (this.#usingVfc) this.#video?.cancelVideoFrameCallback(this.#frame);
		else cancelAnimationFrame(this.#frame);
		this.#stream?.getTracks().forEach((track) => track.stop());
		this.#stream = null;
		this.#landmarker?.close();
		this.#landmarker = null;
		if (this.#video) this.#video.srcObject = null;
		this.#lastTime = -1;
		if (this.#recording?.length) download(serializeClip(this.#recording));
		this.#recording = null;
		this.labels = null;
		this.stats = '';
		this.hands = NO_HANDS;
		this.skeleton = [];
		this.status = 'off';
	}

	#rebuildPipeline() {
		this.#pipelineHand = settings.drawingHand;
		this.#pipeline = createPipeline({ drawingHand: this.#pipelineHand });
	}

	#schedule() {
		const video = this.#video;
		if (!video) return;
		this.#frame = this.#usingVfc
			? video.requestVideoFrameCallback((now, metadata) => this.#onVideoFrame(now, metadata))
			: requestAnimationFrame(this.#tick);
	}

	#onVideoFrame(now: number, metadata: VideoFrameCallbackMetadata) {
		const time = metadata.mediaTime > 0 ? metadata.mediaTime * 1000 : now;
		this.#frameStats.presented(metadata.presentedFrames);
		if (time > this.#lastTime) {
			this.#lastTime = time;
			this.#detect(time);
		}
		this.#schedule();
	}

	#tick = () => {
		const video = this.#video;
		if (video && video.currentTime !== this.#lastTime && video.readyState >= 2) {
			this.#lastTime = video.currentTime;
			this.#detect(performance.now());
		}
		this.#schedule();
	};

	#detect(time: number) {
		const video = this.#video;
		const landmarker = this.#landmarker;
		if (!video || !landmarker) return;
		const aspect = video.videoWidth / video.videoHeight || 4 / 3;
		const started = performance.now();
		const result = landmarker.detectForVideo(video, time);
		this.#frameStats.detect(performance.now() - started);
		const frame = toRawFrame(result, aspect, time);
		this.#recording?.push(frame);
		this.skeleton = frame.hands.map((h) => h.landmarks.map((p) => ({ x: 1 - p.x, y: p.y })));
		if (settings.drawingHand !== this.#pipelineHand) this.#rebuildPipeline();
		this.hands = this.#pipeline(frame);
		if (this.labels) {
			this.labels = frame.hands.map((h) => `${h.label} ${h.score.toFixed(2)}`);
			this.#showStats(started);
		}
	}

	#showStats(now: number) {
		if (now - this.#statsShownAt < 500) return;
		this.#statsShownAt = now;
		const { p50, p95, dropped } = this.#frameStats.summary();
		this.stats = `${this.#delegate} ${p50.toFixed(0)}/${p95.toFixed(0)} ms, ${dropped} dropped`;
	}
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
