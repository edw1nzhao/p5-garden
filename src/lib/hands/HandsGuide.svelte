<script lang="ts">
	import { untrack } from 'svelte';
	import { Check, X } from '@lucide/svelte';
	import { settings } from '#lib/settings.svelte.js';
	import { CALIBRATED_SHAPES, type CalibratedShape } from './calibration.js';
	import { guide } from './guide.svelte.js';
	import { CLEAR_ENTRY, LEGEND } from './legend.js';
	import Ring from './Ring.svelte';
	import { tracker } from './tracker.svelte.js';

	let { nothingToGrab = false, onpaint }: { nothingToGrab?: boolean; onpaint: () => void } =
		$props();

	const GLYPHS: Record<CalibratedShape, { glyph: string; name: string; how: string }> = {
		fist: { glyph: '✊', name: 'Fist', how: 'All fingers curled in' },
		one: { glyph: '☝️', name: 'One finger', how: 'Index up, the rest curled, thumb tucked' },
		two: { glyph: '✌️', name: 'Two fingers', how: 'Index and middle up' },
		three: { glyph: '3', name: 'Three fingers', how: 'Index, middle and ring up, pinky curled' },
		L: { glyph: 'L', name: 'L shape', how: 'Index up and thumb out to the side' },
		open: { glyph: '🖐️', name: 'Open hand', how: 'All fingers spread' }
	};
	const STEP_LABELS = ['Your hand', 'Pinch', 'Shapes', 'Done'] as const;
	const STEPS = ['hand', 'pinch', 'calibrate', 'done'] as const;

	const state = $derived(guide.state);
	const stepIndex = $derived(STEPS.indexOf(state.step));
	const otherHand = $derived(settings.drawingHand === 'Right' ? 'Left' : 'Right');

	$effect(() => {
		const { drawing, off } = tracker.hands;
		const raw = tracker.rawHands;
		untrack(() => guide.feed({ time: performance.now(), raw, drawing, off }));
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') guide.close();
	}
</script>

<div class="guide glass" role="dialog" tabindex="-1" aria-label="Hands setup" onkeydown={onKey}>
	<header>
		<h2>Set up hands</h2>
		<ol class="steps" aria-label="Steps">
			{#each STEP_LABELS as label, i (label)}
				<li aria-current={i === stepIndex ? 'step' : undefined} class:past={i < stepIndex}>
					{label}
				</li>
			{/each}
		</ol>
		<button type="button" class="close" aria-label="Close setup" onclick={() => guide.close()}>
			<X size={16} aria-hidden="true" />
		</button>
	</header>

	{#if nothingToGrab}
		<p class="nudge">
			Arrange has nothing to grab yet. Plant a seed first, or
			<button type="button" class="link" onclick={onpaint}>switch to Paint</button>.
		</p>
	{/if}

	<p class="status" role="status" aria-live="polite">{state.status}</p>

	{#if state.step === 'hand'}
		<div class="body">
			<Ring value={state.hand.detected ? 1 : state.hand.progress} size={72} label="Reading" />
			<div class="col">
				{#if state.hand.detected}
					<p>
						Your drawing hand is <strong>{settings.drawingHand}</strong>.
						<button type="button" class="link" onclick={() => (settings.drawingHand = otherHand)}>
							Switch to {otherHand}
						</button>
					</p>
					{#if settings.labelsInverted}
						<p class="muted">
							Your camera reports hands the other way round, so the labels are flipped for you.
						</p>
					{/if}
				{:else}
					<p class="muted">Only one hand in view, palm toward the camera.</p>
				{/if}
			</div>
		</div>
	{:else if state.step === 'pinch'}
		<div class="body">
			<div class="glyph" class:ok={state.pinched} aria-hidden="true">
				{#if state.pinched}<Check size={28} />{:else}🤏{/if}
			</div>
			<p class="muted">
				Use your {settings.drawingHand.toLowerCase()} hand. Pinch, move, and open your fingers to let
				go.
			</p>
		</div>
	{:else if state.step === 'calibrate'}
		<p class="muted">Use your off hand, the one you do not paint with. Hold each shape steady.</p>
		<ul class="shapes">
			{#each CALIBRATED_SHAPES as shape (shape)}
				{@const g = GLYPHS[shape]}
				{@const done = state.calibrate.done.includes(shape)}
				{@const active = state.calibrate.shape === shape}
				<li class:active class:done>
					<span class="glyph small" aria-hidden="true">{g.glyph}</span>
					<span class="name">
						<strong>{g.name}</strong>
						{#if active}<span class="muted">{g.how}</span>{/if}
					</span>
					{#if active}
						<Ring value={state.calibrate.progress} size={40} label={g.name} />
					{:else if done}
						<Check size={16} aria-hidden="true" />
						<button type="button" class="link" onclick={() => guide.retry(shape)}>
							Retry<span class="sr"> {g.name}</span>
						</button>
					{/if}
				</li>
			{/each}
		</ul>
		{#if state.calibrate.warning}<p class="warn">{state.calibrate.warning}</p>{/if}
	{:else}
		<ul class="legend-list">
			{#each [...LEGEND, CLEAR_ENTRY] as entry (entry.gesture)}
				<li>
					<span class="gesture">{entry.gesture}</span>
					<span class="muted">{entry.effect}</span>
				</li>
			{/each}
		</ul>
		<p class="muted">Reopen this any time with the ? in the gesture list.</p>
	{/if}

	<footer>
		{#if state.step === 'calibrate' && settings.calibration}
			<button type="button" class="link" onclick={() => (settings.calibration = null)}>
				Use built-in rules
			</button>
		{/if}
		<span class="spacer"></span>
		{#if state.step === 'done'}
			<button type="button" class="primary" onclick={() => guide.close()}>Close</button>
		{:else if state.step === 'calibrate' && state.calibrate.templates}
			<button type="button" class="primary" onclick={() => guide.finishCalibration()}>
				Finish
			</button>
		{:else}
			<button
				type="button"
				class:primary={(state.step === 'hand' && !!state.hand.detected) ||
					(state.step === 'pinch' && state.pinched)}
				onclick={() => guide.next()}
			>
				{(state.step === 'hand' && state.hand.detected) || (state.step === 'pinch' && state.pinched)
					? 'Next'
					: 'Skip'}
			</button>
		{/if}
	</footer>
</div>

<style>
	.guide {
		position: absolute;
		right: calc(var(--space) * 4);
		bottom: calc(var(--space) * 4);
		z-index: 3;
		width: calc(var(--space) * 92);
		max-width: calc(100vw - var(--space) * 8);
		display: grid;
		gap: calc(var(--space) * 3);
		padding: calc(var(--space) * 4);
		border-radius: var(--radius-lg);
		font-size: var(--text-sm);
	}
	header {
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 3);
	}
	h2 {
		margin: 0;
		font-size: var(--text-md);
	}
	.steps {
		flex: 1;
		display: flex;
		gap: calc(var(--space) * 2);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.steps li[aria-current='step'] {
		color: var(--fg);
		font-weight: 600;
	}
	.steps li.past {
		color: var(--accent-soft);
	}
	.close,
	.link,
	footer button {
		font: inherit;
		color: var(--fg);
		cursor: pointer;
	}
	.close {
		display: grid;
		place-items: center;
		width: calc(var(--space) * 8);
		height: calc(var(--space) * 8);
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
	}
	.close:hover,
	footer button:hover {
		background: var(--surface-hover);
	}
	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent-soft);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.guide button:focus-visible {
		outline: 2px solid var(--accent-soft);
		outline-offset: 2px;
	}
	.status {
		margin: 0;
		font-weight: 600;
	}
	.nudge {
		margin: 0;
		padding: calc(var(--space) * 2) calc(var(--space) * 3);
		border-radius: var(--radius-sm);
		background: var(--surface-hover);
	}
	.muted {
		margin: 0;
		color: var(--fg-muted);
		font-size: var(--text-xs);
	}
	.body {
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 4);
	}
	.col {
		display: grid;
		gap: calc(var(--space) * 1);
	}
	.col p {
		margin: 0;
	}
	.glyph {
		display: grid;
		place-items: center;
		width: calc(var(--space) * 16);
		height: calc(var(--space) * 16);
		border-radius: 50%;
		background: var(--surface-hover);
		font-size: 2rem;
	}
	.glyph.ok {
		background: var(--accent-strong);
	}
	.glyph.small {
		flex: none;
		width: calc(var(--space) * 9);
		height: calc(var(--space) * 9);
		font-size: 1.125rem;
		font-weight: 700;
	}
	.shapes,
	.legend-list {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.shapes li {
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 3);
		padding: calc(var(--space) * 1) calc(var(--space) * 2);
		border-radius: var(--radius-sm);
		color: var(--fg-muted);
	}
	.shapes li.active {
		background: var(--accent-strong);
		color: var(--fg);
	}
	.shapes li.done {
		color: var(--fg);
	}
	.name {
		flex: 1;
		display: grid;
	}
	.legend-list li {
		display: flex;
		gap: calc(var(--space) * 3);
	}
	.gesture {
		min-width: calc(var(--space) * 28);
		font-weight: 600;
	}
	.warn {
		margin: 0;
		color: var(--danger);
	}
	footer {
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 3);
	}
	.spacer {
		flex: 1;
	}
	footer button:not(.link) {
		height: calc(var(--space) * 8);
		padding: 0 calc(var(--space) * 4);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-pill);
		background: transparent;
	}
	footer .primary {
		border-color: transparent;
		background: var(--accent-strong);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
