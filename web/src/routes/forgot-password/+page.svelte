<script lang="ts">
	import { pb } from '$lib/pb';
	import { pushToast, errorMessage } from '$lib/stores/toast.svelte';

	let email = $state('');
	let loading = $state(false);
	let sent = $state(false);

	async function submit(e: Event) {
		e.preventDefault();
		loading = true;
		try {
			await pb.collection('users').requestPasswordReset(email);
			sent = true;
		} catch (err) {
			// O backend já responde de forma genérica (sem revelar se o e-mail existe);
			// aqui só tratamos erros reais de rede/validação (ex.: e-mail em formato inválido).
			pushToast(errorMessage(err), 'error');
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Esqueci a senha — Flashcards</title></svelte:head>

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
		<h1 class="text-2xl font-extrabold tracking-tight">Esqueci a senha</h1>
		<p class="mt-1 text-sm text-neutral-500">Enviamos um link de redefinição para o seu e-mail</p>
	</div>

	{#if sent}
		<div class="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
			<p class="text-sm text-neutral-600 dark:text-neutral-300">
				Se <strong>{email}</strong> tiver uma conta cadastrada, você vai receber um e-mail com as instruções
				para redefinir sua senha em instantes.
			</p>
			<p class="text-xs text-neutral-500">Não recebeu? Confira o spam ou tente novamente em alguns minutos.</p>
		</div>
	{:else}
		<form onsubmit={submit} class="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
			<div>
				<label for="email" class="mb-1 block text-sm font-medium">E-mail</label>
				<input
					id="email"
					type="email"
					required
					bind:value={email}
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-950"
					placeholder="voce@exemplo.com"
				/>
			</div>
			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
			>
				{loading ? 'Enviando…' : 'Enviar link de redefinição'}
			</button>
		</form>
	{/if}

	<p class="mt-6 text-center text-sm text-neutral-500">
		Lembrou a senha? <a href="/login" class="font-medium text-brand-600 hover:underline">Entrar</a>
	</p>
</div>
