<script lang="ts">
	import { Undo2 } from '@lucide/svelte';
	import { toasts } from './toast.svelte.js';
</script>

{#if toasts.current}
	{@const toast = toasts.current}
	<div class="toast glass" role="status">
		<span>{toast.text}</span>
		{#if toast.action}
			<button
				type="button"
				onclick={() => {
					toast.action?.run();
					toasts.dismiss();
				}}
			>
				{#if toast.action.label === 'Undo'}<Undo2 size={14} aria-hidden="true" />{/if}
				{toast.action.label}
			</button>
		{/if}
	</div>
{/if}

<style>
	.toast {
		position: absolute;
		left: 50%;
		bottom: 128px;
		transform: translateX(-50%);
		z-index: 4;
		display: flex;
		align-items: center;
		gap: calc(var(--space) * 3);
		padding: calc(var(--space) * 2) calc(var(--space) * 2) calc(var(--space) * 2)
			calc(var(--space) * 4);
		border-radius: var(--radius-pill);
		font-size: var(--text-sm);
		white-space: nowrap;
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: calc(var(--space) * 1.5);
		height: calc(var(--space) * 7);
		padding: 0 calc(var(--space) * 3);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--accent-strong);
		color: var(--fg);
		font: inherit;
		cursor: pointer;
	}
	button:focus-visible {
		outline: 2px solid var(--accent-soft);
		outline-offset: 2px;
	}
</style>
