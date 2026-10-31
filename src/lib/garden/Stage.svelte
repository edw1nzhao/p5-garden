<script lang="ts">
	import { Sketch } from 'svelte-p5-components';
	import { prefersReducedMotion } from 'svelte/motion';
	import { BASE_RADIUS, elementRadius, hitTest } from '#lib/scene/geometry.js';
	import type { Scene } from '#lib/scene/scene.svelte.js';
	import { BACKDROPS } from './backdrops.js';
	import { KINDS } from './kinds.js';
	import { gardenSketch } from './sketch.js';

	let { scene, element = $bindable() }: { scene: Scene; element?: HTMLDivElement } = $props();

	let width = $state(0);
	let height = $state(0);
	const stage = $derived({ width, height });
	const sketch = $derived(gardenSketch(scene));
	// Under 'demand', reading the elements deeply makes any scene change redraw.
	const bridge = {
		get state() {
			return { elements: scene.elements, mood: scene.mood };
		}
	};

	type Gesture =
		{ mode: 'move'; id: string; dx: number; dy: number } | { mode: 'scale' | 'rotate'; id: string };
	let gesture: Gesture | null = null;

	const selection = $derived.by(() => {
		const el = scene.selected;
		if (!el || !width) return null;
		return { el, cx: el.x * width, cy: el.y * height, r: elementRadius(el, stage) };
	});

	const description = $derived.by(() => {
		const place = BACKDROPS[scene.mood.backdrop].words;
		if (scene.elements.length === 0) return `An empty garden on ${place}, waiting for seeds.`;
		const counts = new Map<string, number>();
		for (const el of scene.elements) {
			const noun = KINDS[el.kind].noun;
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
		if (e.button !== 0) return;
		const pt = local(e);
		const hit = hitTest(scene.elements, pt.x, pt.y, stage);
		if (!hit) return scene.select(null);
		scene.select(hit.id);
		scene.raise(hit.id);
		gesture = { mode: 'move', id: hit.id, dx: hit.x * width - pt.x, dy: hit.y * height - pt.y };
		element!.setPointerCapture(e.pointerId);
		element!.focus();
	}

	function onHandleDown(e: PointerEvent, mode: 'scale' | 'rotate') {
		if (!scene.selected) return;
		e.stopPropagation();
		gesture = { mode, id: scene.selected.id };
		element!.setPointerCapture(e.pointerId);
	}

	function onMove(e: PointerEvent) {
		if (!gesture || !selection) return;
		const pt = local(e);
		if (gesture.mode === 'move') {
			scene.move(gesture.id, (pt.x + gesture.dx) / width, (pt.y + gesture.dy) / height);
			return;
		}
		const dx = pt.x - selection.cx;
		const dy = pt.y - selection.cy;
		if (gesture.mode === 'scale') {
			scene.transform(gesture.id, {
				scale: Math.hypot(dx, dy) / (BASE_RADIUS * Math.min(width, height))
			});
		} else {
			scene.transform(gesture.id, { rotation: Math.atan2(dy, dx) + Math.PI / 2 });
		}
	}

	function onUp() {
		gesture = null;
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
	<Sketch
		{sketch}
		{description}
		{bridge}
		loop={prefersReducedMotion.current ? 'demand' : 'always'}
	/>
	{#if selection}
		<div
			class="selection"
			data-testid="selection"
			style="left: {selection.cx}px; top: {selection.cy}px; width: {selection.r *
				2}px; height: {selection.r * 2}px; transform: translate(-50%, -50%) rotate({selection.el
				.rotation}rad);"
		>
			<div
				class="handle rotate"
				aria-hidden="true"
				data-testid="rotate-handle"
				onpointerdown={(e) => onHandleDown(e, 'rotate')}
			></div>
			<div
				class="handle scale"
				aria-hidden="true"
				data-testid="scale-handle"
				onpointerdown={(e) => onHandleDown(e, 'scale')}
			></div>
		</div>
	{/if}
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
	.stage:focus-visible {
		box-shadow: inset 0 0 0 2px #a5b4fc;
	}
	.selection {
		position: absolute;
		border: 1.5px dashed rgb(255 255 255 / 0.7);
		box-shadow: 0 0 0 1px rgb(0 0 0 / 0.35);
		border-radius: 50%;
		pointer-events: none;
	}
	.handle {
		position: absolute;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0 0 3px rgb(99 102 241 / 0.6);
		pointer-events: auto;
		touch-action: none;
	}
	.handle.rotate {
		left: 50%;
		top: -30px;
		transform: translateX(-50%);
		cursor: grab;
	}
	.handle.scale {
		right: -9px;
		top: 50%;
		transform: translateY(-50%);
		cursor: nwse-resize;
	}
</style>
