<script lang="ts">
	import { Scene, type ElementKind } from '#lib/scene/scene.svelte.js';
	import { KINDS, KIND_ORDER } from '#lib/garden/kinds.js';
	import Stage from '#lib/garden/Stage.svelte';
	import Panel from '#lib/garden/Panel.svelte';

	const scene = new Scene();
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
			Drag a seed onto the soil. Drag to move, use the handles to grow and turn, Delete to remove.
		</p>
	</header>

	<aside aria-label="Seeds">
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
						<span class="swatch {kind}" aria-hidden="true"></span>
						{KINDS[kind].label}
					</button>
				</li>
			{/each}
		</ul>
	</aside>

	<main>
		<Stage {scene} bind:element={stageEl} />
	</main>

	<div class="panel-area">
		<Panel {scene} />
	</div>

	{#if drag?.active}
		<div class="ghost" style="left: {drag.x}px; top: {drag.y}px;" aria-hidden="true">
			<span class="swatch {drag.kind}"></span>
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
		grid-template: 'header header header' auto 'aside main panel' 1fr / 10rem 1fr 16rem;
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
	.swatch {
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.swatch.bloom {
		background: radial-gradient(circle, #fde68a 20%, #f472b6 60%, #a855f7);
	}
	.swatch.swarm {
		background:
			radial-gradient(circle, #67e8f9 15%, transparent 20%),
			radial-gradient(circle at 30% 70%, #38bdf8 12%, transparent 16%),
			radial-gradient(circle at 70% 30%, #818cf8 12%, transparent 16%), #1e293b;
	}
	.swatch.ribbon {
		background: linear-gradient(135deg, #34d399, #22d3ee 50%, #6366f1);
		border-radius: 0.375rem 1rem;
	}
	.ghost {
		position: fixed;
		pointer-events: none;
		transform: translate(-50%, -50%) scale(2);
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
