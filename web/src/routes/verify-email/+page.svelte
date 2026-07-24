<script lang="ts">
	import { pb } from '$lib/pb';
	import { page } from '$app/state';
	import { errorMessage } from '$lib/stores/toast.svelte';

	let token = $derived(page.url.searchParams.get('token') ?? '');
	let status = $state<'idle' | 'loading' | 'done' | 'error'>('idle');
	let errorMsg = $state('');

	async function confirm(t: string) {
		status = 'loading';
		try {
			await pb.collection('users').confirmVerification(t);
			status = 'done';
		} catch (err) {
			status = 'error';
			errorMsg = errorMessage(err);
		}
	}

	$effect(() => {
		if (token) confirm(token);
	});
</script>

<svelte:head><title>Confirmar e-mail — Flashcards</title></svelte:head>

<div class="w-full max-w-sm">
	<div class="mb-8 text-center">
		<span
			class="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md"
		>
			<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="5" width="14" height="10" rx="2" />
				<path d="M7 9h9M7 12h6" />
				<path d="M21 9v6a2 2 0 0 1-2 2H9" />
			</svg>
		</span>
		<h1 class="text-2xl font-extrabold tracking-tight">Confirmar e-mail</h1>
	</div>

	<div class="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
		{#if !token}
			<p class="text-sm text-neutral-600 dark:text-neutral-300">
				Link inválido ou incompleto. Copie o link do e-mail de confirmação novamente.
			</p>
		{:else if status === 'idle' || status === 'loading'}
			<p class="text-sm text-neutral-600 dark:text-neutral-300">Confirmando seu e-mail…</p>
		{:else if status === 'done'}
			<p class="text-sm text-neutral-600 dark:text-neutral-300">
				E-mail confirmado! Agora você já pode entrar na sua conta.
			</p>
			<a
				href="/login"
				class="inline-block w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
			>
				Ir para o login
			</a>
		{:else}
			<p class="text-sm text-neutral-600 dark:text-neutral-300">
				Não deu pra confirmar: {errorMsg}
			</p>
			<p class="text-sm text-neutral-500">
				O link pode ter expirado. Tente entrar — dá pra reenviar um novo e-mail de confirmação
				por lá.
			</p>
		{/if}
	</div>

	<p class="mt-6 text-center text-sm text-neutral-500">
		<a href="/login" class="font-medium text-brand-600 hover:underline dark:text-brand-400">Entrar</a>
	</p>
</div>
