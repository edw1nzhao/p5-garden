<script lang="ts">
	import { Check, Copy, Download, ExternalLink, X } from '@lucide/svelte';
	import { playgroundLink, p5Sketch, svelteComponent, type GardenSnapshot } from './codegen.js';

	let { garden, onclose }: { garden: GardenSnapshot; onclose: () => void } = $props();

	const FORMATS = {
		svelte: {
			label: 'svelte-p5',
			file: 'Garden.svelte',
			lead: 'A svelte-p5 component. Drop it into a SvelteKit page with svelte-p5 and p5 installed.',
			make: svelteComponent
		},
		p5: {
			label: 'p5.js',
			file: 'garden.js',
			lead: 'A plain p5.js sketch in instance mode. Run it with p5 installed, or in the playground.',
			make: p5Sketch
		}
	} as const;
	type Format = keyof typeof FORMATS;

	let format = $state<Format>('svelte');
	let copied = $state(false);
	let link = $state('');
	const code = $derived(FORMATS[format].make(garden));

	$effect(() => {
		const snapshot = $state.snapshot({ mood: garden.mood, elements: garden.elements });
		let live = true;
		const timer = setTimeout(() => {
			playgroundLink(snapshot).then((url) => live && (link = url));
		}, 250);
		return () => {
			live = false;
			clearTimeout(timer);
		};
	});

	async function copy() {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function download() {
		const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
		const a = Object.assign(document.createElement('a'), {
			href: url,
			download: FORMATS[format].file
		});
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<section class="code" aria-labelledby="code-title">
	<header>
		<h2 id="code-title">Code</h2>
		<button type="button" class="icon-btn" aria-label="Close code" onclick={onclose}>
			<X size={18} aria-hidden="true" />
		</button>
	</header>

	<div class="tabs" role="tablist" aria-label="Format">
		{#each Object.entries(FORMATS) as [id, f] (id)}
			<button
				type="button"
				role="tab"
				id="code-tab-{id}"
				aria-selected={format === id}
				aria-controls="code-panel"
				onclick={() => (format = id as Format)}
			>
				{f.label}
			</button>
		{/each}
	</div>
	<p class="lead">{FORMATS[format].lead}</p>

	<div id="code-panel" role="tabpanel" aria-labelledby="code-tab-{format}" class="panel">
		<!-- A scrollable region must take keyboard focus so it can be scrolled without a mouse. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<pre tabindex="0" aria-label="Generated code" data-testid="code"><code>{code}</code></pre>
	</div>

	<div class="actions">
		<button type="button" onclick={copy}>
			{#if copied}<Check size={16} aria-hidden="true" /> Copied{:else}<Copy
					size={16}
					aria-hidden="true"
				/> Copy{/if}
		</button>
		<button type="button" onclick={download}>
			<Download size={16} aria-hidden="true" /> Download
		</button>
		<a
			class="primary"
			href={link || undefined}
			target="_blank"
			rel="noopener noreferrer"
			aria-disabled={!link}
		>
			<ExternalLink size={16} aria-hidden="true" /> Open in playground
		</a>
	</div>
</section>

<style>
	.code {
		display: grid;
		grid-template-rows: auto auto auto 1fr auto;
		gap: calc(var(--space) * 3);
		padding: calc(var(--space) * 4);
		min-height: 0;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: calc(var(--space) * 9);
		height: calc(var(--space) * 9);
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--fg);
		cursor: pointer;
	}
	.icon-btn:hover {
		background: var(--surface-hover);
	}
	.tabs {
		display: flex;
		gap: var(--space);
		padding: var(--space);
		border-radius: var(--radius-pill);
		background: var(--surface);
	}
	.tabs button {
		flex: 1;
		height: calc(var(--space) * 8);
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.tabs button[aria-selected='true'] {
		background: var(--accent-strong);
		color: var(--fg);
	}
	.lead {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.panel {
		display: grid;
		min-height: 0;
	}
	pre {
		margin: 0;
		min-height: 0;
		overflow: auto;
		padding: calc(var(--space) * 3);
		border-radius: var(--radius-md);
		background: rgb(2 6 23 / 0.8);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: var(--text-xs);
		line-height: 1.6;
		tab-size: 2;
		white-space: pre;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: calc(var(--space) * 2);
	}
	.actions button,
	.actions a {
		display: inline-flex;
		align-items: center;
		gap: calc(var(--space) * 1.5);
		height: calc(var(--space) * 9);
		padding: 0 calc(var(--space) * 3);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--fg);
		font: inherit;
		font-size: var(--text-sm);
		text-decoration: none;
		cursor: pointer;
	}
	.actions button:hover,
	.actions a:hover {
		background: var(--surface-hover);
	}
	.actions .primary {
		background: var(--accent-strong);
		border-color: var(--accent-soft);
	}
	.actions .primary[aria-disabled='true'] {
		opacity: 0.6;
		pointer-events: none;
	}
	button:focus-visible,
	a:focus-visible,
	pre:focus-visible {
		outline: 2px solid var(--accent-soft);
		outline-offset: 2px;
	}
</style>
