<script lang="ts">
	import { toasts } from '$lib/stores/toast.svelte';

	const styles: Record<string, string> = {
		success: 'bg-emerald-600 text-white',
		error: 'bg-red-600 text-white',
		info: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
	};
</script>

<div class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
	{#each toasts as t (t.id)}
		<div
			class="pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg {styles[t.kind]}"
			role="status"
		>
			{t.message}
		</div>
	{/each}
</div>
