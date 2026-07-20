<script lang="ts">
	import { Rating, RATINGS, RATING_LABEL } from '$lib/fsrs';

	let {
		intervals,
		onRate,
		disabled = false
	}: { intervals: Record<number, string>; onRate: (r: Rating) => void; disabled?: boolean } = $props();

	const STYLE: Record<number, string> = {
		[Rating.Again]: 'bg-red-600 hover:bg-red-700',
		[Rating.Hard]: 'bg-amber-500 hover:bg-amber-600',
		[Rating.Good]: 'bg-emerald-600 hover:bg-emerald-700',
		[Rating.Easy]: 'bg-brand-600 hover:bg-brand-700'
	};
</script>

<div class="grid grid-cols-4 gap-2">
	{#each RATINGS as r, i (r)}
		<button
			{disabled}
			onclick={() => onRate(r)}
			class="flex flex-col items-center gap-0.5 rounded-xl py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 {STYLE[r]}"
		>
			<span>{RATING_LABEL[r]}</span>
			<span class="text-xs font-normal opacity-90">{intervals[r] ?? ''}</span>
			<span class="text-[10px] font-normal opacity-70">({i + 1})</span>
		</button>
	{/each}
</div>
