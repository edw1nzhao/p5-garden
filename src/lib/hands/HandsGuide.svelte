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
		fist: { glyph: '✊', name: 'Fist', how: 'Fold all your fingers in' },
		one: { glyph: '☝️', name: 'One finger', how: 'Point with your index finger' },
		two: { glyph: '✌️', name: 'Two fingers', how: 'Index and middle up' },
		three: { glyph: '3', name: 'Three fingers', how: 'Index, middle and ring up' },
		L: { glyph: 'L', name: 'L shape', how: 'Thumb out, index up' },
		open: { glyph: '🖐️', name: 'Open hand', how: 'Spread your whole hand' }
	};
	const STEP_LABELS = ['Your hand', 'Pinch', 'Shapes', 'Done'] as const;
	const STEPS = ['hand', 'pinch', 'calibrate', 'done'] as const;

	const state = $derived(guide.state);
	const stepIndex = $derived(STEPS.indexOf(state.step));
	const otherHand = $derived(settings.drawingHand === 'Right' ? 'Left' : 'Right');
	const cal = $derived(state.calibrate);
	const current = $derived(cal.shape ? GLYPHS[cal.shape] : null);
	const confused = $derived(cal.confusedWith ? GLYPHS[cal.confusedWith] : null);

	$effect(() => {
		const { drawing, off } = tracker.hands;
		const raw = tracker.rawHands;
		untrack(() => guide.feed({ time: performance.now(), raw, drawing, off }));
	});

	$effect(() => {
		const id = setInterval(() => guide.tick(performance.now()), 100);
		return () => clearInterval(id);
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') guide.close();
	}

	function useBuiltIn() {
		settings.calibration = null;
		guide.next();
	}
</script>

<div
	class="guide glass"
	role="dialog"
	tabindex="-1"
	aria-label="Hands setup"
	onkeydown={onKey}
	onpointerenter={() => guide.hold(true)}
	onfocusin={() => guide.hold(true)}
>
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
					<p class="beat">
						<Check size={16} aria-hidden="true" />
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
				{#if state.pinched}
					Pinching works. Moving on.
				{:else}
					Use your {settings.drawingHand.toLowerCase()} hand. Pinch, move, and open your fingers to let
					go.
				{/if}
			</p>
		</div>
	{:else if state.step === 'calibrate' && current}
		<div class="shape" data-phase={cal.phase}>
			<div class="big" aria-hidden="true">{current.glyph}</div>
			<div class="col">
				<strong class="shape-name">{current.name}</strong>
				<span class="how">{current.how}</span>
				<span class="muted">
					Shape {CALIBRATED_SHAPES.indexOf(cal.shape!) + 1} of {CALIBRATED_SHAPES.length}
				</span>
			</div>
			<div class="phase" aria-hidden="true">
				{#if cal.phase === 'waiting'}
					<span class="wait">Show your other hand</span>
				{:else if cal.phase === 'countdown'}
					<span class="count">{cal.countdown}</span>
				{:else if cal.phase === 'capturing'}
					<Ring value={cal.progress} size={72} label={current.name} />
				{:else if cal.phase === 'confirm'}
					<span class="got"><Check size={20} />Got it</span>
				{:else if confused}
					<span class="retry">That looked like your {confused.glyph}. Let's try again.</span>
				{/if}
			</div>
		</div>
		<ol class="row" aria-label="Shapes">
			{#each CALIBRATED_SHAPES as shape (shape)}
				{@const done = cal.done.includes(shape)}
				<li class:active={cal.shape === shape} class:done title={GLYPHS[shape].name}>
					<span class="glyph small" aria-hidden="true">{GLYPHS[shape].glyph}</span>
					<span class="tick">
						{#if done}<Check size={12} aria-hidden="true" /><span class="sr"
								>{GLYPHS[shape].name} done</span
							>{/if}
					</span>
				</li>
			{/each}
		</ol>
	{:else if state.step === 'calibrate'}
		<p class="muted">All six shapes saved.</p>
	{:else}
		<ul class="legend-list">
			{#each [...LEGEND, CLEAR_ENTRY] as entry (entry.gesture)}
				<li>
					<span class="gesture">{entry.gesture}</span>
					<span class="muted">{entry.effect}</span>
				</li>
			{/each}
		</ul>
		{#if cal.lowConfidence.length}
			<p class="warn">
				Some shapes looked alike ({cal.lowConfidence.map((s) => GLYPHS[s].name).join(', ')}). Reopen
				this with the ? to redo them.
			</p>
		{:else if cal.warning}
			<p class="warn">{cal.warning}</p>
		{/if}
		<p class="muted">Closing by itself. Reopen any time with the ? in the gesture list.</p>
	{/if}

	<footer>
		{#if state.step === 'calibrate'}
			<button type="button" class="link" onclick={useBuiltIn}>Use built-in rules</button>
			{#if cal.done.length}
				<button type="button" class="link" onclick={() => guide.redoPrevious()}>
					Redo previous shape
				</button>
			{/if}
		{/if}
		<span class="spacer"></span>
		{#if state.step === 'done'}
			<button type="button" class="primary" onclick={() => guide.close()}>Close</button>
		{:else}
			<button type="button" onclick={() => guide.close()}>Skip</button>
		{/if}
	</footer>
</div>

<style>
	.guide {
		position: absolute;
		left: 50%;
		bottom: calc(var(--space) * 28);
		transform: translateX(-50%);
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
	.legend-list {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.beat {
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 2);
		flex-wrap: wrap;
	}
	.shape {
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 4);
	}
	.shape .col {
		flex: 1;
	}
	.big {
		display: grid;
		place-items: center;
		flex: none;
		width: calc(var(--space) * 20);
		height: calc(var(--space) * 20);
		border-radius: 50%;
		background: var(--surface-hover);
		font-size: 3rem;
		font-weight: 700;
	}
	.shape-name {
		font-size: var(--text-xl);
	}
	.how {
		font-size: var(--text-md);
	}
	.phase {
		display: grid;
		place-items: center;
		min-width: calc(var(--space) * 22);
		text-align: center;
	}
	.wait,
	.retry {
		color: var(--fg-muted);
	}
	.retry {
		color: var(--danger);
	}
	.count {
		font-size: 3rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.got {
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 1);
		font-weight: 600;
		color: var(--accent-soft);
	}
	@media (prefers-reduced-motion: no-preference) {
		.count {
			animation: pulse 0.8s ease-out infinite;
		}
	}
	@keyframes pulse {
		from {
			transform: scale(1.25);
			opacity: 0.6;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
	.row {
		display: flex;
		justify-content: space-between;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row li {
		display: grid;
		justify-items: center;
		gap: calc(var(--space) * 1);
		color: var(--fg-muted);
	}
	.row li.active .glyph {
		background: var(--accent-strong);
		color: var(--fg);
	}
	.row li.done {
		color: var(--accent-soft);
	}
	.tick {
		height: calc(var(--space) * 4);
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
