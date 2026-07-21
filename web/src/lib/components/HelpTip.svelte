<script lang="ts">
	import type { Snippet } from 'svelte';

	// Ícone "?" pequeno que revela uma dica contextual só quando clicado — a ideia é
	// nunca poluir a tela com texto explicativo por padrão, mas deixar a explicação
	// a um clique de distância bem no ponto onde a dúvida costuma aparecer.
	let {
		title = '',
		text = '',
		children,
		label = 'Ajuda'
	}: { title?: string; text?: string; children?: Snippet; label?: string } = $props();

	let open = $state(false);
	let wrapperEl: HTMLElement;

	function toggle(e: MouseEvent) {
		e.stopPropagation();
		open = !open;
	}
	function close() {
		open = false;
	}
	function onDocClick(e: MouseEvent) {
		if (open && wrapperEl && !wrapperEl.contains(e.target as Node)) close();
	}
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onclick={onDocClick} onkeydown={onKeydown} />

<span class="relative inline-flex align-middle" bind:this={wrapperEl}>
	<button
		type="button"
		onclick={toggle}
		aria-label={label}
		aria-expanded={open}
		class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-[11px] font-bold text-neutral-500 transition hover:border-brand-400 hover:text-brand-600 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-brand-500 dark:hover:text-brand-400"
	>?</button>

	{#if open}
		<div
			role="tooltip"
			class="absolute left-0 top-full z-30 mt-2 w-64 max-w-[80vw] rounded-xl border border-neutral-200 bg-white p-3 text-left text-xs leading-relaxed text-neutral-600 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
		>
			{#if title}<p class="mb-1 font-semibold text-neutral-800 dark:text-neutral-100">{title}</p>{/if}
			{#if children}{@render children()}{:else}<p>{text}</p>{/if}
		</div>
	{/if}
</span>
