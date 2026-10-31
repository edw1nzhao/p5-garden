<script lang="ts">
	import { MAX_SCALE, MIN_SCALE, STYLE_RANGES, type Scene } from '#lib/scene/scene.svelte.js';
	import { BACKDROPS, BACKDROP_ORDER } from './backdrops.js';
	import { KINDS } from './kinds.js';

	let { scene }: { scene: Scene } = $props();

	const PRESETS = [
		{ name: 'Sunset', hue: 15 },
		{ name: 'Gold', hue: 45 },
		{ name: 'Forest', hue: 120 },
		{ name: 'Ocean', hue: 200 },
		{ name: 'Violet', hue: 265 },
		{ name: 'Neon', hue: 310 }
	];

	const el = $derived(scene.selected);
	const degrees = $derived(
		el ? Math.round((((el.rotation * 180) / Math.PI) % 360) + 360) % 360 : 0
	);
</script>

{#snippet slider(
	id: string,
	name: string,
	shown: string,
	min: number,
	max: number,
	step: number,
	value: number,
	set: (v: number) => void
)}
	<div class="field">
		<span class="row">
			<label for="panel-{id}">{name}</label>
			<output for="panel-{id}">{shown}</output>
		</span>
		<input
			id="panel-{id}"
			class:hue={id === 'hue'}
			type="range"
			{min}
			{max}
			{step}
			{value}
			oninput={(e) => set(+e.currentTarget.value)}
		/>
	</div>
{/snippet}

<aside class="panel" aria-label="Selected plant">
	{#if el}
		<h2>{KINDS[el.kind].label}</h2>

		<fieldset>
			<legend>Colour</legend>
			<div class="presets">
				{#each PRESETS as preset (preset.name)}
					<button
						type="button"
						class="preset"
						style="--h: {preset.hue}"
						aria-label={preset.name}
						aria-pressed={el.hue === preset.hue}
						title={preset.name}
						onclick={() => scene.update(el.id, { hue: preset.hue })}
					></button>
				{/each}
			</div>
			{@render slider('hue', 'Hue', `${el.hue}°`, 0, 359, 1, el.hue, (v) =>
				scene.update(el.id, { hue: v })
			)}
			{@render slider(
				'vividness',
				'Vividness',
				`${Math.round(el.vividness * 100)}%`,
				STYLE_RANGES.vividness.min,
				STYLE_RANGES.vividness.max,
				0.05,
				el.vividness,
				(v) => scene.update(el.id, { vividness: v })
			)}
		</fieldset>

		<fieldset>
			<legend>Shape</legend>
			{@render slider(
				'density',
				'Density',
				`${el.density.toFixed(1)}×`,
				STYLE_RANGES.density.min,
				STYLE_RANGES.density.max,
				0.1,
				el.density,
				(v) => scene.update(el.id, { density: v })
			)}
			{@render slider(
				'size',
				'Size',
				`${el.scale.toFixed(1)}×`,
				MIN_SCALE,
				MAX_SCALE,
				0.05,
				el.scale,
				(v) => scene.transform(el.id, { scale: v })
			)}
			{@render slider('turn', 'Turn', `${degrees}°`, 0, 359, 1, degrees, (v) =>
				scene.transform(el.id, { rotation: (v * Math.PI) / 180 })
			)}
			{@render slider(
				'speed',
				'Speed',
				`${el.speed.toFixed(1)}×`,
				STYLE_RANGES.speed.min,
				STYLE_RANGES.speed.max,
				0.1,
				el.speed,
				(v) => scene.update(el.id, { speed: v })
			)}
		</fieldset>

		<div class="actions">
			<button type="button" onclick={() => scene.reroll(el.id)}>Re-roll</button>
			<button type="button" onclick={() => scene.raise(el.id)}>To front</button>
			<button type="button" class="danger" onclick={() => scene.remove(el.id)}>Delete</button>
		</div>
	{:else}
		<h2>Garden</h2>
		<p class="empty">Select a plant to tune it. These settings change the whole garden.</p>

		<fieldset>
			<legend>Backdrop</legend>
			<div class="backdrops">
				{#each BACKDROP_ORDER as id (id)}
					{@const b = BACKDROPS[id]}
					<button
						type="button"
						class="backdrop"
						class:light={b.light}
						style="--top: {b.colors[0]}; --bottom: {b.colors[1]}"
						aria-pressed={scene.mood.backdrop === id}
						onclick={() => scene.setMood({ backdrop: id })}
					>
						{b.label}
					</button>
				{/each}
			</div>
		</fieldset>

		<fieldset>
			<legend>Air</legend>
			{@render slider(
				'wind',
				'Wind',
				`${Math.round(scene.mood.wind * 100)}%`,
				0,
				1,
				0.05,
				scene.mood.wind,
				(v) => scene.setMood({ wind: v })
			)}
			<button
				type="button"
				class="toggle"
				aria-pressed={scene.mood.glow}
				disabled={BACKDROPS[scene.mood.backdrop].light}
				title={BACKDROPS[scene.mood.backdrop].light ? 'Glow needs a dark backdrop' : undefined}
				onclick={() => scene.setMood({ glow: !scene.mood.glow })}
			>
				Glow
			</button>
		</fieldset>
	{/if}
</aside>

<style>
	.panel {
		padding: 1rem;
		overflow-y: auto;
		display: grid;
		align-content: start;
		gap: 1rem;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
	}
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		display: grid;
		gap: 0.75rem;
	}
	legend {
		padding: 0;
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #94a3b8;
	}
	.field {
		display: grid;
		gap: 0.25rem;
		font-size: 0.875rem;
	}
	.row {
		display: flex;
		justify-content: space-between;
	}
	output {
		color: #94a3b8;
		font-variant-numeric: tabular-nums;
	}
	input[type='range'] {
		width: 100%;
		accent-color: #818cf8;
	}
	.hue {
		appearance: none;
		height: 0.625rem;
		border-radius: 999px;
		background: linear-gradient(
			to right,
			hsl(0 80% 60%),
			hsl(60 80% 60%),
			hsl(120 80% 60%),
			hsl(180 80% 60%),
			hsl(240 80% 60%),
			hsl(300 80% 60%),
			hsl(359 80% 60%)
		);
	}
	.hue::-webkit-slider-thumb {
		appearance: none;
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0 0 2px #0b0f19;
	}
	.hue::-moz-range-thumb {
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 50%;
		background: #fff;
	}
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.preset {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		border: 2px solid transparent;
		background: hsl(var(--h) 75% 58%);
		cursor: pointer;
	}
	.preset[aria-pressed='true'] {
		border-color: #fff;
	}
	.backdrops {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.backdrop {
		min-height: 2.75rem;
		border: 2px solid #334155;
		border-radius: 0.5rem;
		background: linear-gradient(var(--top), var(--bottom));
		color: #fff;
		font: inherit;
		font-size: 0.8125rem;
		text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
		cursor: pointer;
	}
	.backdrop.light {
		color: #1f2937;
		text-shadow: none;
	}
	.backdrop[aria-pressed='true'] {
		border-color: #a5b4fc;
	}
	.toggle {
		justify-self: start;
		min-height: 2.25rem;
		padding: 0 0.875rem;
		border: 1px solid #334155;
		border-radius: 999px;
		background: #111827;
		color: inherit;
		font: inherit;
		font-size: 0.875rem;
		cursor: pointer;
	}
	.toggle[aria-pressed='true'] {
		background: #4f46e5;
		border-color: #818cf8;
	}
	.toggle:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.actions button {
		min-height: 2.25rem;
		padding: 0 0.75rem;
		border: 1px solid #334155;
		border-radius: 0.375rem;
		background: #111827;
		color: inherit;
		font: inherit;
		font-size: 0.875rem;
		cursor: pointer;
	}
	.actions button:hover {
		border-color: #6366f1;
	}
	.actions .danger:hover {
		border-color: #f87171;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid #a5b4fc;
		outline-offset: 2px;
	}
	.empty {
		margin: 0;
		font-size: 0.875rem;
		color: #94a3b8;
	}
</style>
