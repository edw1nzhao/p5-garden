<script lang="ts">
	import { Scene, type Brush, type ElementKind } from '#lib/scene/scene.svelte.js';
	import { KINDS, KIND_ORDER } from '#lib/garden/kinds.js';
	import Stage from '#lib/garden/Stage.svelte';
	import Panel from '#lib/garden/Panel.svelte';
	import CodePanel from '#lib/garden/CodePanel.svelte';
	import {
		Brush as BrushIcon,
		CodeXml,
		Leaf,
		MousePointer2,
		SlidersHorizontal,
		Sparkles,
		Spline
	} from '@lucide/svelte';
	import { thumbnails } from '#lib/garden/thumbnails.svelte.js';

	const scene = new Scene();
	let tool = $state<'arrange' | 'paint'>('arrange');
	let brush = $state<Brush>('vine');
	let tuneOpen = $state(false);
	let codeOpen = $state(false);
	let stack = $state<{ index: number; total: number } | null>(null);
	const TOOLS = [
		{ id: 'arrange', label: 'Arrange', hint: 'Select, move, turn and resize', icon: MousePointer2 },
		{ id: 'paint', label: 'Paint', hint: 'Drag on the canvas to paint', icon: BrushIcon }
	] as const;
	const BRUSHES = [
		{ id: 'vine', label: 'Vine', icon: Leaf },
		{ id: 'shimmer', label: 'Shimmer', icon: Sparkles },
		{ id: 'silk', label: 'Silk', icon: Spline }
	] as const;
	const hint = $derived(
		tool === 'paint'
			? 'Paint: drag across the canvas to paint a living stroke'
			: scene.selected && stack
				? `Layer ${stack.index} of ${stack.total} here · click again for the next`
				: scene.selected
					? 'Drag to move · grips to turn and resize · Delete removes'
					: 'Drag a seed onto the canvas, or click one to plant it'
	);
	let stageEl = $state<HTMLDivElement>();

	interface Drag {
		kind: ElementKind;
		startX: number;
		startY: number;
		x: number;
		y: number;
		active: boolean;
	}
	let drag = $state<Drag | null>(null);
	let suppressClick = false;

	function onSeedDown(e: PointerEvent, kind: ElementKind) {
		if (e.button !== 0) return;
		drag = {
			kind,
			startX: e.clientX,
			startY: e.clientY,
			x: e.clientX,
			y: e.clientY,
			active: false
		};
	}

	function onWindowMove(e: PointerEvent) {
		if (!drag) return;
		drag.x = e.clientX;
		drag.y = e.clientY;
		if (!drag.active && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
			drag.active = true;
		}
	}

	function onWindowUp(e: PointerEvent) {
		if (!drag) return;
		const wasDrag = drag.active;
		const kind = drag.kind;
		drag = null;
		if (!wasDrag || !stageEl) return;
		suppressClick = true;
		const rect = stageEl.getBoundingClientRect();
		const inside =
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom;
		if (inside) {
			scene.add(kind, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
			stageEl.focus();
		}
	}

	function onSeedClick(kind: ElementKind) {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		scene.add(kind, 0.5, 0.5);
		stageEl?.focus();
	}
</script>

<svelte:head>
	<title>p5 garden</title>
	<meta
		name="description"
		content="Drag living, generative elements onto a canvas and arrange them."
	/>
</svelte:head>

<svelte:window onpointermove={onWindowMove} onpointerup={onWindowUp} />

<div class="app" class:dragging={drag?.active} class:tune-open={tuneOpen}>
	<main>
		<Stage {scene} {tool} {brush} bind:element={stageEl} bind:stack>
			{#snippet actions()}
				<button
					type="button"
					class="poster"
					aria-pressed={codeOpen}
					onclick={() => (codeOpen = !codeOpen)}
				>
					<CodeXml size={16} aria-hidden="true" /> Code
				</button>
			{/snippet}
		</Stage>
	</main>

	<header class="brand glass">
		<h1>p5 garden</h1>
		<nav class="links" aria-label="About">
			<a href="https://svelte-p5.dev" target="_blank" rel="noopener noreferrer"
				>Built with svelte-p5</a
			>
			<a href="https://github.com/edw1nzhao/p5-garden" target="_blank" rel="noopener noreferrer"
				>Source</a
			>
		</nav>
	</header>

	<aside class="rail glass" aria-label="Seeds">
		<ul class="seeds">
			{#each KIND_ORDER as kind (kind)}
				<li>
					<button
						type="button"
						class="tile seed"
						data-kind={kind}
						title="Drag onto the canvas, or click to plant in the centre"
						onpointerdown={(e) => onSeedDown(e, kind)}
						onclick={() => onSeedClick(kind)}
					>
						{#if thumbnails[kind]}
							<img
								class="icon"
								src={thumbnails[kind]}
								alt=""
								width="40"
								height="40"
								draggable="false"
							/>
						{:else}
							<span class="icon" aria-hidden="true"></span>
						{/if}
						<span>{KINDS[kind].label}</span>
					</button>
				</li>
			{/each}
		</ul>
	</aside>

	<div class="dock">
		<p class="hint" aria-live="polite">{hint}</p>
		<div class="toolbar glass" role="toolbar" aria-label="Tools">
			{#each TOOLS as t (t.id)}
				<button
					type="button"
					class="tool"
					aria-pressed={tool === t.id}
					title={t.hint}
					onclick={() => (tool = t.id)}
				>
					<t.icon size={18} aria-hidden="true" />
					<span>{t.label}</span>
				</button>
			{/each}
			{#if tool === 'paint'}
				<span class="sep" role="presentation"></span>
				{#each BRUSHES as b (b.id)}
					<button
						type="button"
						class="tool"
						aria-pressed={brush === b.id}
						onclick={() => (brush = b.id)}
					>
						<b.icon size={16} aria-hidden="true" />
						<span>{b.label}</span>
					</button>
				{/each}
			{/if}
			<span class="sep tune-only" role="presentation"></span>
			<button
				type="button"
				class="tool tune-only"
				aria-pressed={tuneOpen}
				aria-controls="inspector"
				onclick={() => (tuneOpen = !tuneOpen)}
			>
				<SlidersHorizontal size={18} aria-hidden="true" />
				<span>Tune</span>
			</button>
		</div>
	</div>

	{#if codeOpen}
		<div class="inspector code-drawer glass">
			<CodePanel garden={scene} onclose={() => (codeOpen = false)} />
		</div>
	{:else}
		<div id="inspector" class="inspector glass">
			<Panel {scene} />
		</div>
	{/if}

	{#if drag?.active}
		<div class="ghost" style="left: {drag.x}px; top: {drag.y}px;" aria-hidden="true">
			{#if thumbnails[drag.kind]}
				<img src={thumbnails[drag.kind]} alt="" width="56" height="56" draggable="false" />
			{/if}
		</div>
	{/if}
</div>

<style>
	.app {
		position: relative;
		height: 100dvh;
		overflow: hidden;
	}
	.app.dragging {
		cursor: grabbing;
		user-select: none;
	}
	main {
		position: absolute;
		inset: 0;
	}
	.brand {
		position: absolute;
		top: calc(var(--space) * 4);
		left: calc(var(--space) * 4);
		display: flex;
		align-items: baseline;
		gap: calc(var(--space) * 4);
		padding: calc(var(--space) * 2) calc(var(--space) * 4);
		border-radius: var(--radius-pill);
	}
	h1 {
		margin: 0;
		font-size: var(--text-lg);
		letter-spacing: -0.01em;
	}
	.links {
		display: flex;
		gap: calc(var(--space) * 3);
		font-size: var(--text-sm);
		white-space: nowrap;
	}
	.links a {
		color: var(--accent-soft);
		text-decoration: none;
	}
	.links a:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.rail {
		position: absolute;
		top: calc(var(--space) * 18);
		left: calc(var(--space) * 4);
		max-height: calc(100dvh - var(--space) * 48);
		width: calc(var(--space) * 20);
		padding: calc(var(--space) * 2);
		overflow-y: auto;
		scrollbar-width: none;
	}
	.seeds {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space);
	}
	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space);
		width: 100%;
		padding: calc(var(--space) * 2) var(--space);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: var(--text-xs);
		cursor: grab;
		touch-action: none;
		transition: background 120ms;
	}
	.tile:hover {
		background: var(--surface-hover);
	}
	.icon {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		background: var(--bg);
		pointer-events: none;
	}
	.dock {
		position: absolute;
		left: 50%;
		bottom: calc(var(--space) * 4);
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
		gap: calc(var(--space) * 2);
	}
	.hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--fg-muted);
		white-space: nowrap;
		text-shadow: 0 1px 4px rgb(0 0 0 / 0.8);
		pointer-events: none;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space);
		padding: var(--space);
		border-radius: var(--radius-pill);
	}
	.tool {
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 2);
		height: calc(var(--space) * 10);
		padding: 0 calc(var(--space) * 4);
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: background 120ms;
	}
	.tool:hover {
		background: var(--surface-hover);
	}
	.tool[aria-pressed='true'] {
		background: var(--accent-strong);
	}
	.tile:focus-visible,
	.tool:focus-visible {
		outline: 2px solid var(--accent-soft);
		outline-offset: 2px;
	}
	.sep {
		width: 1px;
		height: calc(var(--space) * 6);
		background: var(--glass-border);
	}
	.tune-only {
		display: none;
	}
	.inspector {
		position: absolute;
		top: calc(var(--space) * 18);
		right: calc(var(--space) * 4);
		width: calc(var(--space) * 68);
		max-height: calc(100dvh - var(--space) * 48);
		display: grid;
		overflow: hidden;
	}
	.code-drawer {
		width: calc(var(--space) * 120);
		max-width: calc(100vw - var(--space) * 32);
		height: calc(100dvh - var(--space) * 48);
		display: grid !important;
	}
	.ghost {
		position: fixed;
		pointer-events: none;
		transform: translate(-50%, -50%);
		opacity: 0.9;
		z-index: 10;
		filter: drop-shadow(0 8px 16px rgb(0 0 0 / 0.5));
	}
	.ghost img {
		border-radius: var(--radius-md);
	}
	@media (max-width: 40rem) {
		.links {
			display: none;
		}
		.rail {
			top: auto;
			left: calc(var(--space) * 2);
			right: calc(var(--space) * 2);
			bottom: calc(var(--space) * 20);
			width: auto;
			max-height: none;
			overflow-x: auto;
		}
		.seeds {
			grid-auto-flow: column;
			grid-auto-columns: calc(var(--space) * 16);
		}
		.dock {
			left: calc(var(--space) * 2);
			right: calc(var(--space) * 2);
			bottom: calc(var(--space) * 2);
			transform: none;
		}
		.hint {
			display: none;
		}
		.toolbar {
			max-width: 100%;
			overflow-x: auto;
			scrollbar-width: none;
		}
		.tool {
			padding: 0 calc(var(--space) * 3);
		}
		.tune-only {
			display: flex;
		}
		.sep.tune-only {
			display: block;
		}
		.inspector {
			display: none;
			top: auto;
			left: calc(var(--space) * 2);
			right: calc(var(--space) * 2);
			bottom: calc(var(--space) * 18);
			width: auto;
			max-height: 50dvh;
		}
		.tune-open .inspector {
			display: grid;
		}
		.tune-open .rail {
			display: none;
		}
	}
</style>
