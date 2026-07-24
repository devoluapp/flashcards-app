<script lang="ts">
	import { pb } from '$lib/pb';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pushToast, errorMessage } from '$lib/stores/toast.svelte';

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let unverified = $state(false);
	let resending = $state(false);

	async function submit(e: Event) {
		e.preventDefault();
		loading = true;
		unverified = false;
		try {
			await pb.collection('users').authWithPassword(email, password);
			const next = page.url.searchParams.get('next');
			goto(next && next.startsWith('/') ? next : '/decks');
		} catch (err) {
			const msg = errorMessage(err);
			// Mensagem exata que o PocketBase devolve quando authRule = "verified = true"
			// barra o login (ver backend/pb_migrations/1721300600_require_email_verification.js)
			// — confirmada rodando contra uma instância real, não tem a palavra "verif".
			if (msg.toLowerCase().includes('collection requirements')) {
				unverified = true;
			} else {
				pushToast(msg, 'error');
			}
		} finally {
			loading = false;
		}
	}

	async function resend() {
		resending = true;
		try {
			await pb.collection('users').requestVerification(email);
			pushToast('E-mail de confirmação reenviado.', 'success');
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			resending = false;
		}
	}
</script>

<svelte:head><title>Entrar — Flashcards</title></svelte:head>

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
		<h1 class="text-2xl font-extrabold tracking-tight">Bem-vindo de volta</h1>
		<p class="mt-1 text-sm text-neutral-500">Entre para continuar seus estudos</p>
	</div>

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
		<div>
			<div class="mb-1 flex items-center justify-between">
				<label for="password" class="block text-sm font-medium">Senha</label>
				<a href="/forgot-password" class="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">Esqueci a senha</a>
			</div>
			<input
				id="password"
				type="password"
				required
				bind:value={password}
				class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-950"
				placeholder="••••••••"
			/>
		</div>
		<button
			type="submit"
			disabled={loading}
			class="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
		>
			{loading ? 'Entrando…' : 'Entrar'}
		</button>
	</form>

	{#if unverified}
		<div class="mt-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900 dark:bg-amber-950/40">
			<p class="text-sm text-amber-800 dark:text-amber-200">
				Confirme seu e-mail antes de entrar.
			</p>
			<button
				type="button"
				onclick={resend}
				disabled={resending}
				class="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400 disabled:opacity-60"
			>
				{resending ? 'Reenviando…' : 'Reenviar e-mail de confirmação'}
			</button>
		</div>
	{/if}

	<p class="mt-6 text-center text-sm text-neutral-500">
		Ainda não tem conta? <a href="/register" class="font-medium text-brand-600 hover:underline dark:text-brand-400">Criar conta</a>
	</p>
</div>
