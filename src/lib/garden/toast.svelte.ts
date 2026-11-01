import type { Scene } from '#lib/scene/scene.svelte.js';

export interface ToastAction {
	label: string;
	run: () => void;
}

export interface ToastMessage {
	id: number;
	text: string;
	action?: ToastAction;
}

const DEFAULT_MS = 6000;

/** One short message with an optional action, shared by the toolbar, the stage and the hands guide. */
class Toasts {
	current = $state.raw<ToastMessage | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;
	#id = 0;

	show(text: string, action?: ToastAction, ms = DEFAULT_MS) {
		clearTimeout(this.#timer);
		this.current = { id: ++this.#id, text, action };
		this.#timer = setTimeout(() => this.dismiss(), ms);
	}

	dismiss() {
		clearTimeout(this.#timer);
		this.current = null;
	}
}

export const toasts = new Toasts();

/** Clears the garden as one undo step and offers the undo; false when there was nothing to clear. */
export function clearGarden(scene: Scene): boolean {
	if (!scene.clear()) return false;
	toasts.show('Garden cleared', { label: 'Undo', run: () => scene.undo() });
	return true;
}
