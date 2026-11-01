<script lang="ts">
	let { value, size = 96, label }: { value: number; size?: number; label: string } = $props();

	const RADIUS = 42;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	const percent = $derived(Math.round(Math.min(1, Math.max(0, value)) * 100));
</script>

<svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="{label} {percent}%">
	<circle class="track" cx="50" cy="50" r={RADIUS} />
	<circle
		class="fill"
		cx="50"
		cy="50"
		r={RADIUS}
		stroke-dasharray={CIRCUMFERENCE}
		stroke-dashoffset={CIRCUMFERENCE * (1 - percent / 100)}
		transform="rotate(-90 50 50)"
	/>
	<text x="50" y="50" text-anchor="middle" dominant-baseline="central">{percent}%</text>
</svg>

<style>
	circle {
		fill: none;
		stroke-width: 8;
	}
	.track {
		stroke: var(--glass-border);
	}
	.fill {
		stroke: var(--accent-soft);
		stroke-linecap: round;
	}
	text {
		fill: var(--fg);
		font-size: 22px;
		font-variant-numeric: tabular-nums;
	}
</style>
