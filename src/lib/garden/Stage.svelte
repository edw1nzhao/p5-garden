<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Sketch } from 'svelte-p5-components';
	import { ExportButton } from 'svelte-p5-components/export';
	import { prefersReducedMotion } from 'svelte/motion';
	import { elementRadius, hitAll, smoothPath, strokeFromPath } from '#lib/scene/geometry.js';
	import type { Brush, Scene } from '#lib/scene/scene.svelte.js';
	import { Maximize2, Move, RotateCw } from '@lucide/svelte';
	import { BACKDROPS } from './backdrops.js';
	import { KINDS } from './kinds.js';
	import { gardenSketch } from './sketch.js';

	let {
		scene,
		element = $bindable(),
		tool = 'arrange',
		brush = 'vine',
		stack = $bindable(null),
		actions
	}: {
		scene: Scene;
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

	let width = $state(0);
	let height = $state(0);
	const stage = $derived({ width, height });
	const sketch = $derived(gardenSketch(scene));
	// Under 'demand', reading the elements deeply makes any scene change redraw.
	const bridge = {
		get state() {
			return { elements: scene.elements, mood: scene.mood, draft: scene.draft };
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

	const selection = $derived.by(() => {
		const el = scene.selected;
		if (!el || !width) return null;
		const cx = el.x * width;
		const cy = el.y * height;
		const r = elementRadius(el, stage);
		// Leave room for the floating toolbar along the bottom edge.
		const below = cy + r + PILL_GAP + PILL_HEIGHT <= height - DOCK_CLEARANCE;
		const pillTop = below ? cy + r + PILL_GAP : cy - r - PILL_GAP - PILL_HEIGHT;
		const pillLeft = Math.min(Math.max(cx, 110), Math.max(110, width - 110));
		return { el, cx, cy, r, pillTop, pillLeft };
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

	function local(e: PointerEvent) {
		const rect = element!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function onStageDown(e: PointerEvent) {
		if (e.button !== 0 || (e.target as Element).closest('button')) return;
		const pt = local(e);
		if (tool === 'paint') {
			scene.select(null);
			painting = [pt];
			scene.draft = [{ x: pt.x / width, y: pt.y / height }];
			element!.setPointerCapture(e.pointerId);
			return;
		}
		const hits = hitAll(scene.elements, pt.x, pt.y, stage);
		if (hits.length === 0) {
			stack = null;
			return scene.select(null);
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
		element!.setPointerCapture(e.pointerId);
		element!.focus();
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
		if (painting) {
			const pt = local(e);
			const last = painting[painting.length - 1];
			if (Math.hypot(pt.x - last.x, pt.y - last.y) < 3) return;
			painting.push(pt);
			scene.draft?.push({ x: pt.x / width, y: pt.y / height });
			return;
		}
		if (!gesture || !selection) return;
		const pt = local(e);
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

	function onUp() {
		gesture = null;
		if (cycle && scene.selectedId) {
			const next = (cycle.ids.indexOf(scene.selectedId) + 1) % cycle.ids.length;
			scene.select(cycle.ids[next]);
			stack = { index: next + 1, total: cycle.ids.length };
		}
		cycle = null;
		if (!painting) return;
		if (painting.length >= 3)
			scene.addStroke(brush, strokeFromPath(smoothPath(painting, 2), stage));
		painting = null;
		scene.draft = null;
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

<!-- role=application is a custom pointer and keyboard surface; the lint treats it as static. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="stage"
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
		<div class="actions">
			{@render actions?.()}
			<ExportButton position="static" options={POSTER} class="poster">Save poster</ExportButton>
		</div>
		{#if selection}
			<div
				class="selection"
				data-testid="selection"
				style="left: {selection.cx}px; top: {selection.cy}px; width: {selection.r *
					2}px; height: {selection.r * 2}px; transform: translate(-50%, -50%) rotate({selection.el
					.rotation}rad);"
			></div>
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
