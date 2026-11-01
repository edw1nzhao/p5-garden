<script lang="ts">
	import { ChevronDown, ChevronUp, CircleQuestionMark } from '@lucide/svelte';
	import { guide } from './guide.svelte.js';
	import { CLEAR_ENTRY, LEGEND } from './legend.js';
	import { play } from './play.svelte.js';

	let open = $state(false);
	const active = $derived(LEGEND.find((e) => e.mode === play.intents.mode));
	const hue = $derived(play.intents.hue);
</script>

<section class="legend glass" aria-label="Hand gestures">
	<div class="bar">
		<button
			type="button"
			class="head"
			aria-expanded={open}
			aria-controls="legend-list"
			onclick={() => (open = !open)}
		>
			<span class="dot" style="--hue: {active?.hue ?? 0}" class:on={!!active} aria-hidden="true"
			></span>
			<span class="title">{active ? active.effect : 'Gestures'}</span>
			{#if open}<ChevronDown size={16} aria-hidden="true" />{:else}<ChevronUp
					size={16}
					aria-hidden="true"
				/>{/if}
		</button>
		<button
			type="button"
			class="help"
			aria-label="Set up hands"
			title="Set up hands: your drawing hand and shapes"
			onclick={() => guide.start()}
		>
			<CircleQuestionMark size={16} aria-hidden="true" />
		</button>
	</div>
	{#if open}
		<ul id="legend-list">
			{#each LEGEND as entry (entry.mode)}
				<li class:active={play.intents.mode === entry.mode} data-mode={entry.mode}>
					<span class="dot on" style="--hue: {entry.hue}" aria-hidden="true"></span>
					<span class="gesture">{entry.gesture}</span>
					<span class="effect">{entry.effect}</span>
					{#if entry.mode === 'colour' && hue !== null}
						<span class="swatch" style="--hue: {hue}" title="Latched colour"></span>
					{/if}
				</li>
			{/each}
			<li class:active={play.intents.clearProgress > 0} data-mode="clear">
				<span class="dot on" style="--hue: {CLEAR_ENTRY.hue}" aria-hidden="true"></span>
				<span class="gesture">{CLEAR_ENTRY.gesture}</span>
				<span class="effect">{CLEAR_ENTRY.effect}</span>
			</li>
		</ul>
		<p class="foot">Hold a shape with your off hand, pinch with the other to paint.</p>
	{/if}
</section>

<style>
	.legend {
		position: absolute;
		right: calc(var(--space) * 4);
		bottom: calc(var(--space) * 4);
		z-index: 3;
		max-width: calc(var(--space) * 84);
		padding: var(--space);
		border-radius: var(--radius-lg);
		font-size: var(--text-xs);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: var(--space);
	}
	.help {
		flex: none;
		display: grid;
		place-items: center;
		width: calc(var(--space) * 8);
		height: calc(var(--space) * 8);
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
	}
	.help:hover {
		background: var(--surface-hover);
		color: var(--fg);
	}
	.help:focus-visible {
		outline: 2px solid var(--accent-soft);
		outline-offset: 2px;
	}
	.head {
		flex: 1;
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 2);
		height: calc(var(--space) * 8);
		padding: 0 calc(var(--space) * 3);
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--fg);
		font: inherit;
		cursor: pointer;
	}
	.head:hover {
		background: var(--surface-hover);
	}
	.head:focus-visible {
		outline: 2px solid var(--accent-soft);
		outline-offset: 2px;
	}
	.title {
		flex: 1;
		text-align: left;
	}
	ul {
		list-style: none;
		margin: var(--space) 0 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	li {
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 2);
		padding: calc(var(--space) * 1.5) calc(var(--space) * 3);
		border-radius: var(--radius-sm);
		color: var(--fg-muted);
	}
	li.active {
		background: var(--accent-strong);
		color: var(--fg);
	}
	.gesture {
		min-width: calc(var(--space) * 22);
		color: var(--fg);
		font-weight: 600;
	}
	.effect {
		flex: 1;
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--fg-muted);
	}
	.dot.on {
		background: hsl(var(--hue) 80% 60%);
	}
	.swatch {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: hsl(var(--hue) 80% 60%);
		box-shadow: 0 0 0 1px var(--glass-border);
	}
	.foot {
		margin: calc(var(--space) * 2) calc(var(--space) * 3) calc(var(--space) * 1);
		color: var(--fg-muted);
	}
	@media (max-width: 40rem) {
		.legend {
			display: none;
		}
	}
</style>
