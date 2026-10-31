<script lang="ts">
	import { Scene, type Brush, type ElementKind } from '#lib/scene/scene.svelte.js';
	import { KINDS, KIND_ORDER } from '#lib/garden/kinds.js';
	import Stage from '#lib/garden/Stage.svelte';
	import Panel from '#lib/garden/Panel.svelte';
	import { thumbnails } from '#lib/garden/thumbnails.svelte.js';

	const scene = new Scene();
	let tool = $state<'arrange' | 'paint'>('arrange');
	let brush = $state<Brush>('vine');
	const BRUSHES: { id: Brush; label: string }[] = [
		{ id: 'vine', label: 'Vine' },
		{ id: 'shimmer', label: 'Shimmer' },
		{ id: 'silk', label: 'Silk' }
	];
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

<div class="app" class:dragging={drag?.active}>
	<header>
		<h1>p5 garden</h1>
		<p>
			{tool === 'paint'
				? 'Paint mode: drag across the canvas to paint a living stroke.'
				: 'Drag a seed onto the soil. Drag to move, use the handles to grow and turn, Delete to remove.'}
		</p>
	</header>

	<aside aria-label="Seeds and tools">
		<div class="tools" role="group" aria-label="Tool">
			<button type="button" aria-pressed={tool === 'arrange'} onclick={() => (tool = 'arrange')}>
				Arrange
			</button>
			<button type="button" aria-pressed={tool === 'paint'} onclick={() => (tool = 'paint')}>
				Paint
			</button>
		</div>
		{#if tool === 'paint'}
			<div class="brushes" role="group" aria-label="Brush">
				{#each BRUSHES as b (b.id)}
					<button type="button" aria-pressed={brush === b.id} onclick={() => (brush = b.id)}>
						{b.label}
					</button>
				{/each}
			</div>
		{/if}
		<h2 class="section">Seeds</h2>
		<ul>
			{#each KIND_ORDER as kind (kind)}
				<li>
					<button
						type="button"
						class="seed"
						data-kind={kind}
						onpointerdown={(e) => onSeedDown(e, kind)}
						onclick={() => onSeedClick(kind)}
					>
						{#if thumbnails[kind]}
							<img
								class="icon"
								src={thumbnails[kind]}
								alt=""
								width="36"
								height="36"
								draggable="false"
							/>
						{:else}
							<span class="icon" aria-hidden="true"></span>
						{/if}
						{KINDS[kind].label}
					</button>
				</li>
			{/each}
		</ul>
	</aside>

	<main>
		<Stage {scene} {tool} {brush} bind:element={stageEl} />
	</main>

	<div class="panel-area">
		<Panel {scene} />
	</div>

	{#if drag?.active}
		<div class="ghost" style="left: {drag.x}px; top: {drag.y}px;" aria-hidden="true">
			{#if thumbnails[drag.kind]}
				<img
					class="icon"
					src={thumbnails[drag.kind]}
					alt=""
					width="36"
					height="36"
					draggable="false"
				/>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #0b0f19;
		color: #e2e8f0;
		font-family: system-ui, sans-serif;
	}
	.app {
		display: grid;
		grid-template: 'header header header' auto 'aside main panel' 1fr / 12rem 1fr 16rem;
		height: 100dvh;
	}
	.app.dragging {
		cursor: grabbing;
		user-select: none;
	}
	header {
		grid-area: header;
		display: flex;
		align-items: baseline;
		gap: 1.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #1e293b;
	}
	h1 {
		margin: 0;
		font-size: 1.125rem;
	}
	header p {
		margin: 0;
		font-size: 0.875rem;
		color: #94a3b8;
	}
	aside {
		grid-area: aside;
		border-right: 1px solid #1e293b;
		padding: 0.75rem;
	}
	.tools,
	.brushes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}
	.brushes {
		grid-template-columns: 1fr 1fr 1fr;
	}
	.tools button,
	.brushes button {
		min-height: 2.25rem;
		border: 1px solid #334155;
		border-radius: 0.375rem;
		background: #111827;
		color: inherit;
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
	}
	.tools button[aria-pressed='true'],
	.brushes button[aria-pressed='true'] {
		background: #4f46e5;
		border-color: #818cf8;
	}
	.tools button:focus-visible,
	.brushes button:focus-visible {
		outline: 2px solid #a5b4fc;
		outline-offset: 2px;
	}
	.section {
		margin: 0.75rem 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #94a3b8;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.seed {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		min-height: 2.75rem;
		padding: 0 0.75rem;
		border: 1px solid #334155;
		border-radius: 0.5rem;
		background: #111827;
		color: inherit;
		font: inherit;
		cursor: grab;
		touch-action: none;
	}
	.seed:hover {
		border-color: #6366f1;
	}
	.seed:focus-visible {
		outline: 2px solid #a5b4fc;
		outline-offset: 2px;
	}
	main {
		grid-area: main;
		min-height: 0;
	}
	.panel-area {
		grid-area: panel;
		min-height: 0;
		border-left: 1px solid #1e293b;
		display: grid;
	}
	.icon {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.375rem;
		flex-shrink: 0;
		background: #111827;
		pointer-events: none;
	}
	.ghost {
		position: fixed;
		pointer-events: none;
		transform: translate(-50%, -50%) scale(1.75);
		opacity: 0.85;
		z-index: 10;
	}
	@media (max-width: 40rem) {
		.app {
			grid-template: 'header' auto 'aside' auto 'main' 1fr 'panel' auto / 1fr;
		}
		header p {
			display: none;
		}
		aside {
			border-right: 0;
			border-bottom: 1px solid #1e293b;
		}
		ul {
			grid-auto-flow: column;
		}
		.panel-area {
			border-left: 0;
			border-top: 1px solid #1e293b;
			max-height: 40dvh;
		}
	}
</style>
