<script lang="ts">
	import type { DeckRecord } from '$lib/types';

	let {
		deck,
		dueCount = 0,
		totalCount = 0,
		onEdit,
		onDelete
	}: {
		deck: DeckRecord;
		dueCount?: number;
		totalCount?: number;
		onEdit: () => void;
		onDelete: () => void;
	} = $props();

	const color = $derived(deck.color || '#2563eb');
</script>

<div
	class="group relative flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
>
	<div class="h-1.5 w-full" style:background-color={color}></div>
	<div class="flex flex-1 flex-col p-4">
		<div class="flex items-start justify-between gap-2">
			<a href="/decks/{deck.id}" class="min-w-0 flex-1">
				<h3 class="truncate text-base font-bold">{deck.name}</h3>
				{#if deck.description}
					<p class="mt-0.5 line-clamp-2 text-sm text-neutral-500">{deck.description}</p>
				{/if}
			</a>
			<div class="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
				<button
					onclick={onEdit}
					aria-label="Editar deck"
					class="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
				>
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
						><path d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5Z" /></svg
					>
				</button>
				<button
					onclick={onDelete}
					aria-label="Excluir deck"
					class="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
				>
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
						><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" /></svg
					>
				</button>
			</div>
		</div>

		<div class="mt-4 flex items-center justify-between">
			<span class="text-xs text-neutral-500">{totalCount} card{totalCount === 1 ? '' : 's'}</span>
			<a
				href="/study/{deck.id}"
				class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition {dueCount > 0
					? 'bg-brand-600 text-white hover:bg-brand-700'
					: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'}"
				aria-disabled={dueCount === 0}
				onclick={(e) => dueCount === 0 && e.preventDefault()}
			>
				{#if dueCount > 0}
					<span class="grid h-5 min-w-5 place-items-center rounded-full bg-white/25 px-1 text-xs">{dueCount}</span>
					Estudar
				{:else}
					Em dia
				{/if}
			</a>
		</div>
	</div>
</div>
