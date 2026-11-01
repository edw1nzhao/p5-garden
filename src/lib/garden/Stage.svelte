<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { handEvent, type HandState } from '#lib/hands/gesture.js';
	import { MODE_CONSTANTS, type Intents } from '#lib/hands/modes.js';
	import { play } from '#lib/hands/play.svelte.js';
	import { tracker } from '#lib/hands/tracker.svelte.js';
	import { Sketch } from 'svelte-p5-components';
	import { ExportButton } from 'svelte-p5-components/export';
	import { prefersReducedMotion } from 'svelte/motion';
	import {
		elementRadius,
		hitAll,
		mirrorStroke,
		smoothPath,
		strokeFromPath
	} from '#lib/scene/geometry.js';
	import type { Brush, Scene } from '#lib/scene/scene.svelte.js';
	import { Maximize2, Move, RotateCw } from '@lucide/svelte';
	import { BACKDROPS } from './backdrops.js';
	import { KINDS } from './kinds.js';
	import Ring from '#lib/hands/Ring.svelte';
	import { gardenSketch } from './sketch.js';
	import { clearGarden } from './toast.svelte.js';
	import type { View } from './view.svelte.js';

	let {
		scene,
		view,
		element = $bindable(),
		tool = 'arrange',
		brush = 'vine',
		stack = $bindable(null),
		actions
	}: {
		scene: Scene;
		view: View;
		element?: HTMLDivElement;
		tool?: 'arrange' | 'paint';
		brush?: Brush;
		/** Where the selection sits among the plants under the last click, when there are several. */
		stack?: { index: number; total: number } | null;
		/** Extra buttons shown beside Save poster, over the canvas. */
		actions?: Snippet;
	} = $props();

	// A click (no drag) on the already-selected plant steps to the next one under the pointer.
	let cycle: { ids: string[]; x: number; y: number } | null = null;

	let painting: { x: number; y: number }[] | null = null;
	interface StrokeStyle {
		brush: Brush;
		mirror: boolean;
		hue?: number;
		byHand: boolean;
	}
	let strokeStyle: StrokeStyle | null = null;

	let width = $state(0);
	let height = $state(0);
	const stage = $derived({ width, height });
	const sketch = $derived(gardenSketch(scene, view));
	// Under 'demand', reading the elements deeply makes any scene change redraw.
	const bridge = {
		get state() {
			return {
				elements: scene.elements,
				mood: scene.mood,
				draft: scene.draft,
				mirror: scene.draftMirror,
				view: [view.zoom, view.x, view.y],
				hands: tracker.skeleton
			};
		}
	};

	type Gesture =
		| { mode: 'move'; id: string; dx: number; dy: number }
		| { mode: 'scale'; id: string; startScale: number; startDist: number }
		| { mode: 'rotate'; id: string; lastAngle: number };
	type Grip = 'move' | 'rotate' | 'scale';

	const GRIPS = [
		{ id: 'move', label: 'Move', title: 'Move: drag, or use the arrow keys', icon: Move },
		{ id: 'rotate', label: 'Turn', title: 'Turn: drag around, or press [ and ]', icon: RotateCw },
		{
			id: 'scale',
			label: 'Resize',
			title: 'Resize: drag in or out, or press + and -',
			icon: Maximize2
		}
	] as const;
	// Poster export renders at 3x the canvas's CSS size; the DOM overlay never appears in it.
	const POSTER = { scale: 3, filename: 'p5-garden.png' };
	const PILL_GAP = 14;
	const DOCK_CLEARANCE = 112;
	const PILL_HEIGHT = 44;
	let gesture: Gesture | null = null;
	let panning = $state.raw<{ x: number; y: number } | null>(null);
	let spaceHeld = $state(false);
	let transforming = $state.raw<{ id: string; scale: number; rotation: number } | null>(null);
	const WHEEL_ZOOM = 0.008;

	const selection = $derived.by(() => {
		const el = scene.selected;
		if (!el || !width) return null;
		const cx = el.x * width;
		const cy = el.y * height;
		const r = elementRadius(el, stage);
		const screen = view.toScreen({ x: cx, y: cy });
		const sr = r * view.zoom;
		// Leave room for the floating toolbar along the bottom edge.
		const below = screen.y + sr + PILL_GAP + PILL_HEIGHT <= height - DOCK_CLEARANCE;
		const rawTop = below ? screen.y + sr + PILL_GAP : screen.y - sr - PILL_GAP - PILL_HEIGHT;
		const pillTop = Math.min(
			Math.max(rawTop, 8),
			Math.max(8, height - DOCK_CLEARANCE - PILL_HEIGHT)
		);
		const pillLeft = Math.min(Math.max(screen.x, 110), Math.max(110, width - 110));
		return { el, cx, cy, r, sx: screen.x, sy: screen.y, sr, pillTop, pillLeft };
	});

	const description = $derived.by(() => {
		const place = BACKDROPS[scene.mood.backdrop].words;
		if (scene.elements.length === 0) return `An empty garden on ${place}, waiting for seeds.`;
		const counts = new Map<string, number>();
		for (const el of scene.elements) {
			const noun = el.kind === 'stroke' ? `painted ${el.brush}` : KINDS[el.kind].noun;
			counts.set(noun, (counts.get(noun) ?? 0) + 1);
		}
		const parts = [...counts].map(([noun, n]) => `${n} ${noun}${n > 1 ? 's' : ''}`);
		return `A garden on ${place} with ${parts.join(', ')}, slowly moving.`;
	});

	function screenPoint(e: { clientX: number; clientY: number }) {
		const rect = element!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function local(e: PointerEvent) {
		return view.toWorld(screenPoint(e));
	}

	const HUE_STEP = 360 / MODE_CONSTANTS.hueSteps;
	const HUE_STRIP = `linear-gradient(to bottom, ${Array.from(
		{ length: MODE_CONSTANTS.hueSteps },
		(_, i) =>
			`hsl(${i * HUE_STEP} 85% 60%) ${(i / MODE_CONSTANTS.hueSteps) * 100}% ${((i + 1) / MODE_CONSTANTS.hueSteps) * 100}%`
	).join(', ')})`;
	/** The latched hue's place along the strip, in percent. */
	const hueMarker = $derived(
		(((play.intents.hue ?? 0) / HUE_STEP + 0.5) / MODE_CONSTANTS.hueSteps) * 100
	);
	play.canClear = () => scene.elements.length > 0;
	play.grabbing = () => handDriven && gesture?.mode === 'move';
	const degrees = (rad: number) => Math.round((((rad * 180) / Math.PI) % 360) + 360) % 360;

	function wipe() {
		if (clearGarden(scene)) stack = null;
	}

	function onStageDown(e: PointerEvent) {
		if ((e.target as Element).closest('button')) return;
		if (e.button === 1 || (e.button === 0 && spaceHeld)) {
			e.preventDefault();
			panning = screenPoint(e);
			element!.setPointerCapture(e.pointerId);
			element!.focus();
			return;
		}
		if (e.button !== 0) return;
		if (!downAt(local(e))) return;
		element!.setPointerCapture(e.pointerId);
		element!.focus();
	}

	function handStyle(intents: Intents): StrokeStyle {
		const { brush: forced, mirror, hue } = intents;
		return { brush: forced ?? brush, mirror, hue: hue ?? undefined, byHand: true };
	}

	function startStroke(pt: { x: number; y: number }, style: StrokeStyle) {
		scene.select(null);
		painting = [pt];
		strokeStyle = style;
		scene.draftMirror = style.mirror;
		scene.draft = [{ x: pt.x / width, y: pt.y / height }];
	}

	/** Starts painting or a move at a world point; false when the point hit nothing. */
	function downAt(pt: { x: number; y: number }, intents?: Intents) {
		if (tool === 'paint' || intents?.paints) {
			startStroke(pt, intents ? handStyle(intents) : { brush, mirror: false, byHand: false });
			return true;
		}
		const hits = hitAll(scene.elements, pt.x, pt.y, stage);
		if (hits.length === 0) {
			stack = null;
			scene.select(null);
			return false;
		}
		const current = hits.find((h) => h.id === scene.selectedId);
		const target = current ?? hits[0];
		scene.select(target.id);
		cycle = current && hits.length > 1 ? { ids: hits.map((h) => h.id), x: pt.x, y: pt.y } : null;
		stack = hits.length > 1 ? { index: hits.indexOf(target) + 1, total: hits.length } : null;
		gesture = {
			mode: 'move',
			id: target.id,
			dx: target.x * width - pt.x,
			dy: target.y * height - pt.y
		};
		return true;
	}

	function onGripDown(e: PointerEvent, grip: Grip) {
		if (!selection || e.button !== 0) return;
		e.stopPropagation();
		const { el, cx, cy } = selection;
		const pt = local(e);
		if (grip === 'move') gesture = { mode: 'move', id: el.id, dx: cx - pt.x, dy: cy - pt.y };
		if (grip === 'scale') {
			const startDist = Math.max(8, Math.hypot(pt.x - cx, pt.y - cy));
			gesture = { mode: 'scale', id: el.id, startScale: el.scale, startDist };
		}
		if (grip === 'rotate') {
			gesture = { mode: 'rotate', id: el.id, lastAngle: Math.atan2(pt.y - cy, pt.x - cx) };
		}
		element!.setPointerCapture(e.pointerId);
	}

	function onMove(e: PointerEvent) {
		if (panning) {
			const pt = screenPoint(e);
			view.panBy(pt.x - panning.x, pt.y - panning.y);
			panning = pt;
			return;
		}
		moveTo(local(e));
	}

	function moveTo(pt: { x: number; y: number }) {
		if (painting) {
			const last = painting[painting.length - 1];
			if (Math.hypot(pt.x - last.x, pt.y - last.y) * view.zoom < 3) return;
			painting.push(pt);
			scene.draft?.push({ x: pt.x / width, y: pt.y / height });
			return;
		}
		if (!gesture || !selection) return;
		if (cycle && Math.hypot(pt.x - cycle.x, pt.y - cycle.y) > 3) cycle = null;
		if (gesture.mode === 'move') {
			scene.move(gesture.id, (pt.x + gesture.dx) / width, (pt.y + gesture.dy) / height);
			return;
		}
		const dx = pt.x - selection.cx;
		const dy = pt.y - selection.cy;
		if (gesture.mode === 'scale') {
			const dist = Math.hypot(dx, dy);
			scene.transform(gesture.id, { scale: (gesture.startScale * dist) / gesture.startDist });
		} else {
			// Step by the wrapped change so crossing atan2's ±π seam does not add a full turn.
			const angle = Math.atan2(dy, dx);
			const step = Math.atan2(
				Math.sin(angle - gesture.lastAngle),
				Math.cos(angle - gesture.lastAngle)
			);
			gesture.lastAngle = angle;
			scene.transform(gesture.id, { rotation: selection.el.rotation + step });
		}
	}

	// A pinch acts like a press: pinch to grab or start painting, move, open the fingers to let go.
	let prevHand: HandState | null = null;
	let handDriven = false;
	$effect(() => {
		const hands = tracker.hands;
		untrack(() => {
			const intents = play.update(hands, performance.now(), stage);
			applyTransform(intents);
			if (intents.cancel && handDriven) cancelHandAction();
			if (intents.wipe) wipe();
			if (intents.view) {
				const { dx, dy, factor, cx, cy } = intents.view;
				view.panBy(dx, dy);
				view.zoomAt(factor, cx, cy);
			}
			const next: HandState | null = hands.drawing && {
				pointer: { ...hands.drawing.pointer },
				pinching: intents.pinching
			};
			const event = handEvent(prevHand, next);
			prevHand = next;
			if (!event || event === 'hover' || !width) return;
			const pt = next && view.toWorld({ x: next.pointer.x * width, y: next.pointer.y * height });
			if (event === 'down' && pt) {
				handDriven = true;
				downAt(pt, intents);
			} else if (event === 'move' && pt) {
				switchBrush(intents);
				moveTo(pt);
			} else if (event === 'up') {
				handDriven = false;
				onUp();
			}
		});
	});

	/** Resizes and turns the held plant from its values when the two pinches began. */
	function applyTransform({ transform }: Intents) {
		if (!transform) {
			transforming = null;
			return;
		}
		if (!transforming && gesture?.mode === 'move') {
			const el = scene.selected;
			if (el?.id === gesture.id)
				transforming = { id: el.id, scale: el.scale, rotation: el.rotation };
		}
		if (!transforming) return;
		scene.transform(transforming.id, {
			scale: transforming.scale * transform.scale,
			rotation: transforming.rotation + transform.rotation
		});
	}

	function onUp() {
		panning = null;
		gesture = null;
		if (cycle && scene.selectedId) {
			const next = (cycle.ids.indexOf(scene.selectedId) + 1) % cycle.ids.length;
			scene.select(cycle.ids[next]);
			stack = { index: next + 1, total: cycle.ids.length };
		}
		cycle = null;
		finishStroke();
	}

	function finishStroke() {
		if (!painting) return;
		if (painting.length >= 3 && strokeStyle) {
			const { brush: b, mirror, hue } = strokeStyle;
			const shape = strokeFromPath(smoothPath(painting, 2), stage);
			if (mirror)
				scene.addStrokes([
					{ brush: b, shape, hue },
					{ brush: b, shape: mirrorStroke(shape), hue }
				]);
			else scene.addStroke(b, shape, hue);
		}
		painting = null;
		strokeStyle = null;
		scene.draft = null;
		scene.draftMirror = false;
	}

	/** Ends the current stroke and carries on from the same point when the off hand changes brush. */
	function switchBrush(intents: Intents) {
		if (!painting || !strokeStyle?.byHand || !intents.paints) return;
		const next = handStyle(intents);
		if (next.brush === strokeStyle.brush && next.mirror === strokeStyle.mirror) return;
		const from = painting[painting.length - 1];
		finishStroke();
		startStroke(from, next);
	}

	/** Abandons whatever the drawing hand was doing, without committing it. */
	function cancelHandAction() {
		painting = null;
		strokeStyle = null;
		scene.draft = null;
		scene.draftMirror = false;
		gesture = null;
		cycle = null;
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		if (e.ctrlKey || e.metaKey) {
			const { x, y } = screenPoint(e);
			const delta = Math.max(-50, Math.min(50, e.deltaY));
			view.zoomAt(Math.exp(-delta * WHEEL_ZOOM), x, y);
		} else {
			view.panBy(-e.deltaX, -e.deltaY);
		}
	}

	$effect(() => {
		const stageEl = element;
		stageEl?.addEventListener('wheel', onWheel, { passive: false });
		return () => stageEl?.removeEventListener('wheel', onWheel);
	});

	const typing = (t: EventTarget | null) =>
		t instanceof HTMLElement &&
		(t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName));

	function onWindowKey(e: KeyboardEvent) {
		if (e.code !== 'Space') return;
		if (e.type === 'keyup') spaceHeld = false;
		else if (!typing(e.target)) {
			e.preventDefault();
			spaceHeld = true;
		}
	}

	function onKey(e: KeyboardEvent) {
		const el = scene.selected;
		if (!el) return;
		const step = e.shiftKey ? 0.05 : 0.01;
		const keys: Record<string, () => void> = {
			Delete: () => scene.remove(el.id),
			Backspace: () => scene.remove(el.id),
			Escape: () => scene.select(null),
			ArrowLeft: () => scene.move(el.id, el.x - step, el.y),
			ArrowRight: () => scene.move(el.id, el.x + step, el.y),
			ArrowUp: () => scene.move(el.id, el.x, el.y - step),
			ArrowDown: () => scene.move(el.id, el.x, el.y + step),
			'+': () => scene.transform(el.id, { scale: el.scale * 1.1 }),
			'=': () => scene.transform(el.id, { scale: el.scale * 1.1 }),
			'-': () => scene.transform(el.id, { scale: el.scale / 1.1 }),
			'[': () => scene.transform(el.id, { rotation: el.rotation - Math.PI / 24 }),
			']': () => scene.transform(el.id, { rotation: el.rotation + Math.PI / 24 })
		};
		const action = keys[e.key];
		if (!action) return;
		e.preventDefault();
		action();
	}
</script>

<svelte:window onkeydown={onWindowKey} onkeyup={onWindowKey} onblur={() => (spaceHeld = false)} />

<!-- role=application is a custom pointer and keyboard surface; the lint treats it as static. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="stage"
	class:panning={spaceHeld || panning !== null}
	class:painting={tool === 'paint'}
	bind:this={element}
	bind:clientWidth={width}
	bind:clientHeight={height}
	tabindex="0"
	role="application"
	aria-label="Garden canvas. Select an element, then use arrow keys to move, plus and minus to grow, brackets to turn, Delete to remove."
	onpointerdown={onStageDown}
	onpointermove={onMove}
	onpointerup={onUp}
	onpointercancel={onUp}
	onkeydown={onKey}
>
	<Sketch {sketch} {description} {bridge} loop={prefersReducedMotion.current ? 'demand' : 'always'}>
		{#if play.intents.picking}
			<div
				class="hues"
				style="top: {MODE_CONSTANTS.hueTop * 100}%; bottom: {(1 - MODE_CONSTANTS.hueBottom) *
					100}%; background: {HUE_STRIP};"
				data-testid="hue-strip"
				aria-hidden="true"
			>
				<span class="marker" style="top: {hueMarker}%; --hue: {play.intents.hue ?? 0}"></span>
			</div>
		{/if}
		{#if play.intents.clearProgress > 0}
			<div class="clear-ring glass" data-testid="clear-ring" aria-hidden="true">
				<Ring value={play.intents.clearProgress} size={112} label="Hold to clear" />
				<span>Keep both hands open and still to clear</span>
			</div>
		{/if}
		<div class="actions">
			{@render actions?.()}
			<ExportButton position="static" options={POSTER} class="poster">Save poster</ExportButton>
		</div>
		{#if selection}
			<div
				class="selection"
				data-testid="selection"
				style="left: {selection.sx}px; top: {selection.sy}px; width: {selection.sr *
					2}px; height: {selection.sr * 2}px; transform: translate(-50%, -50%) rotate({selection.el
					.rotation}rad);"
			></div>
			{#if transforming}
				<div
					class="pill readout"
					data-testid="transform-readout"
					role="status"
					style="left: {selection.pillLeft}px; top: {selection.pillTop}px;"
				>
					<span>{Math.round(selection.el.scale * 100)}%</span>
					<span>{degrees(selection.el.rotation)}°</span>
				</div>
			{:else}
				<!-- Pointer grips; the stage's keyboard shortcuts cover the same actions. -->
				<div
					class="pill"
					data-testid="handles"
					aria-hidden="true"
					style="left: {selection.pillLeft}px; top: {selection.pillTop}px;"
				>
					{#each GRIPS as grip (grip.id)}
						<div
							class="grip {grip.id}"
							role="presentation"
							data-testid="{grip.id}-handle"
							title={grip.title}
							onpointerdown={(e) => onGripDown(e, grip.id)}
						>
							<grip.icon size={16} strokeWidth={2.25} />
							<span>{grip.label}</span>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</Sketch>
</div>

<style>
	.stage {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		touch-action: none;
		outline: none;
		cursor: crosshair;
	}
	.stage.painting {
		cursor: cell;
	}
	.stage.panning {
		cursor: grab;
	}
	.stage:focus-visible {
		box-shadow: inset 0 0 0 2px var(--accent-soft);
	}
	.selection {
		position: absolute;
		border: 1.5px dashed rgb(255 255 255 / 0.7);
		box-shadow: 0 0 0 1px rgb(0 0 0 / 0.35);
		border-radius: 50%;
		background: rgb(165 180 252 / 0.12);
		pointer-events: none;
	}
	.hues {
		position: absolute;
		left: 4px;
		width: 10px;
		border-radius: var(--radius-pill);
		box-shadow: 0 0 0 1px rgb(0 0 0 / 0.45);
		pointer-events: none;
		z-index: 2;
	}
	.marker {
		position: absolute;
		left: -4px;
		width: 18px;
		height: 18px;
		margin-top: -9px;
		border-radius: 50%;
		background: hsl(var(--hue) 85% 60%);
		box-shadow:
			0 0 0 2px #fff,
			0 0 0 3px rgb(0 0 0 / 0.5);
	}
	.clear-ring {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 3;
		display: grid;
		justify-items: center;
		gap: calc(var(--space) * 2);
		padding: calc(var(--space) * 5);
		border-radius: var(--radius-lg);
		font-size: var(--text-sm);
		pointer-events: none;
	}
	.actions {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 2;
		display: flex;
		gap: 8px;
	}
	.stage :global(.poster) {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0.5rem 0.875rem;
		border: 1px solid rgb(165 180 252 / 0.5);
		border-radius: 999px;
		background: rgb(15 23 42 / 0.85);
		color: #e2e8f0;
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
		backdrop-filter: blur(6px);
		z-index: 2;
	}
	.stage :global(.poster:hover) {
		background: var(--accent-strong);
	}
	.pill {
		position: absolute;
		display: flex;
		gap: 2px;
		padding: 3px;
		transform: translateX(-50%);
		border-radius: 999px;
		background: rgb(15 23 42 / 0.92);
		box-shadow:
			0 0 0 1px rgb(165 180 252 / 0.5),
			0 6px 20px rgb(0 0 0 / 0.45);
		backdrop-filter: blur(6px);
	}
	.readout {
		gap: 0.75rem;
		padding: 0 1rem;
		height: 44px;
		align-items: center;
		color: #e2e8f0;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}
	.grip {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		height: 38px;
		padding: 0 0.75rem;
		border-radius: 999px;
		color: #e2e8f0;
		font-size: 0.8125rem;
		user-select: none;
		touch-action: none;
	}
	.grip:hover {
		background: var(--accent-strong);
	}
	.grip.move {
		cursor: move;
	}
	.grip.rotate {
		cursor: grab;
	}
	.grip.scale {
		cursor: nwse-resize;
	}
</style>
