<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		onClose,
		children,
		wide = false
	}: { title: string; onClose: () => void; children: Snippet; wide?: boolean } = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
	<div
		class="max-h-[90vh] w-full {wide ? 'max-w-2xl' : 'max-w-md'} overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-neutral-900"
	>
		<div class="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
			<h2 class="text-lg font-bold">{title}</h2>
			<button onclick={onClose} aria-label="Fechar" class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
				<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
			</button>
		</div>
		<div class="p-5">
			{@render children()}
		</div>
	</div>
</div>
