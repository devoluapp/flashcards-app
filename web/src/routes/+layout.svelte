<script lang="ts">
	import '../app.css';
	import '$lib/stores/theme.svelte'; // side effect: aplica o tema salvo em <html data-theme>
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.svelte';
	import { pushToast } from '$lib/stores/toast.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import ToastHost from '$lib/components/ToastHost.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';

	let { children } = $props();

	const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];
	let isPublicRoute = $derived(PUBLIC_ROUTES.includes(page.url.pathname));

	// Auth guard client-side: sem sessão válida -> /login; com sessão, fora de /login /register.
	// Contas não verificadas não têm mais permissão pra ler/escrever dados (ver migration
	// 1721300700) — uma sessão antiga (token emitido antes da conta virar "não verificada"
	// mudar de comportamento) precisa ser derrubada aqui em vez de deixar a UI travada.
	$effect(() => {
		if (auth.isValid && auth.user && !auth.user.verified && page.url.pathname !== '/verify-email') {
			auth.logout();
			pushToast('Confirme seu e-mail para continuar.', 'info');
			goto(`/login?next=${encodeURIComponent(page.url.pathname)}`);
		} else if (!auth.isValid && !isPublicRoute) {
			goto(`/login?next=${encodeURIComponent(page.url.pathname)}`);
		} else if (auth.isValid && isPublicRoute) {
			goto('/decks');
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Flashcards</title>
</svelte:head>

<ToastHost />

{#if auth.isValid && !isPublicRoute}
	<div class="flex min-h-dvh flex-col">
		<Nav />
		<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
			{@render children()}
		</main>
		<AppFooter />
	</div>
{:else if isPublicRoute}
	<div class="flex min-h-dvh flex-col bg-gradient-to-br from-brand-50 via-white to-neutral-50 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900">
		<main class="grid flex-1 place-items-center px-4">
			{@render children()}
		</main>
		<AppFooter />
	</div>
{/if}
