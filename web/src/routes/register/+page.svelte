<script lang="ts">
	import { pb } from '$lib/pb';
	import { pushToast, errorMessage } from '$lib/stores/toast.svelte';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let passwordConfirm = $state('');
	let loading = $state(false);
	let resending = $state(false);
	let registeredEmail = $state('');

	async function submit(e: Event) {
		e.preventDefault();
		if (password !== passwordConfirm) {
			pushToast('As senhas não coincidem.', 'error');
			return;
		}
		loading = true;
		try {
			await pb.collection('users').create({
				email,
				password,
				passwordConfirm,
				name,
				plan: 'free',
				desired_retention: 0.9,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
			});
			await pb.collection('users')
				.requestVerification(email)
				.catch(() => {});
			// Conta criada mas ainda não verificada: o backend exige e-mail confirmado
			// pra autenticar (authRule = "verified = true"), então não faz sentido logar aqui.
			registeredEmail = email;
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			loading = false;
		}
	}

	async function resend() {
		resending = true;
		try {
			await pb.collection('users').requestVerification(registeredEmail);
			pushToast('E-mail de confirmação reenviado.', 'success');
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			resending = false;
		}
	}
</script>

<svelte:head><title>Criar conta — Flashcards</title></svelte:head>

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
		<h1 class="text-2xl font-extrabold tracking-tight">Criar sua conta</h1>
		<p class="mt-1 text-sm text-neutral-500">Grátis para começar — até 3 decks</p>
	</div>

	{#if registeredEmail}
		<div class="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
			<p class="text-sm text-neutral-600 dark:text-neutral-300">
				Conta criada! Enviamos um link de confirmação para <strong>{registeredEmail}</strong>.
				Confirme o e-mail antes de entrar.
			</p>
			<button
				type="button"
				onclick={resend}
				disabled={resending}
				class="text-sm font-medium text-brand-600 hover:underline disabled:opacity-60"
			>
				{resending ? 'Reenviando…' : 'Reenviar e-mail de confirmação'}
			</button>
		</div>
	{:else}
		<form onsubmit={submit} class="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
			<div>
				<label for="name" class="mb-1 block text-sm font-medium">Nome</label>
				<input
					id="name"
					required
					bind:value={name}
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-950"
				/>
			</div>
			<div>
				<label for="email" class="mb-1 block text-sm font-medium">E-mail</label>
				<input
					id="email"
					type="email"
					required
					bind:value={email}
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-950"
				/>
			</div>
			<div>
				<label for="password" class="mb-1 block text-sm font-medium">Senha</label>
				<input
					id="password"
					type="password"
					required
					minlength="8"
					bind:value={password}
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-950"
				/>
			</div>
			<div>
				<label for="passwordConfirm" class="mb-1 block text-sm font-medium">Confirmar senha</label>
				<input
					id="passwordConfirm"
					type="password"
					required
					minlength="8"
					bind:value={passwordConfirm}
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-950"
				/>
			</div>
			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
			>
				{loading ? 'Criando…' : 'Criar conta'}
			</button>
		</form>
	{/if}

	<p class="mt-6 text-center text-sm text-neutral-500">
		Já tem conta? <a href="/login" class="font-medium text-brand-600 hover:underline">Entrar</a>
	</p>
</div>
