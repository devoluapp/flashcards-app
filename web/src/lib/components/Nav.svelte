<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.svelte';
	import { fileUrl } from '$lib/pb';
	import { Settings } from '@lucide/svelte';

	const links = [
		{ href: '/decks', label: 'Decks', icon: 'layers' },
		{ href: '/import', label: 'Importar', icon: 'upload' },
		{ href: '/stats', label: 'Estatísticas', icon: 'chart' },
		{ href: '/settings', label: 'Config', icon: 'gear' }
	];

	function isActive(href: string) {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}

	function logout() {
		auth.logout();
		goto('/login');
	}

	let avatarUrl = $derived(
		auth.user?.avatar ? fileUrl(auth.user, auth.user.avatar, { thumb: '100x100' }) : ''
	);
	let menuOpen = $state(false);
</script>

<header
	class="sticky top-0 z-40 border-b border-neutral-200/80 bg-white/80 backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-950/80"
>
	<div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
		<a href="/decks" class="flex items-center gap-2 font-extrabold tracking-tight">
			<span
				class="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm"
			>
				<svg viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="5" width="14" height="10" rx="2" />
					<path d="M7 9h9M7 12h6" />
					<path d="M21 9v6a2 2 0 0 1-2 2H9" />
				</svg>
			</span>
			<span class="text-lg">Flashcards</span>
		</a>

		<nav class="hidden items-center gap-1 md:flex">
			{#each links as l (l.href)}
				<a
					href={l.href}
					aria-label={l.href === '/settings' ? l.label : undefined}
					title={l.href === '/settings' ? l.label : undefined}
					class="rounded-lg px-3 py-2 text-sm font-medium transition-colors {isActive(l.href)
						? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
						: 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900'}"
				>
					{#if l.href === '/settings'}
						<Settings class="h-5 w-5" />
					{:else}
						{l.label}
					{/if}
				</a>
			{/each}
		</nav>

		<div class="relative flex items-center gap-2">
			<button
				onclick={() => (menuOpen = !menuOpen)}
				class="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
			>
				{#if avatarUrl}
					<img src={avatarUrl} alt="" class="h-8 w-8 rounded-full object-cover" />
				{:else}
					<span
						class="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-200"
					>
						{(auth.user?.name || auth.user?.email || '?').slice(0, 1).toUpperCase()}
					</span>
				{/if}
				<span class="hidden text-sm font-medium sm:inline">{auth.user?.name || auth.user?.email}</span>
			</button>

			{#if menuOpen}
				<div
					class="absolute top-11 right-0 w-48 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
				>
					<a
						href="/settings"
						class="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
						onclick={() => (menuOpen = false)}>Configurações</a
					>
					<button
						onclick={logout}
						class="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
						>Sair</button
					>
				</div>
			{/if}
		</div>
	</div>

	<nav class="flex items-center gap-1 overflow-x-auto border-t border-neutral-200 px-4 py-1.5 md:hidden dark:border-neutral-800">
		{#each links as l (l.href)}
			<a
				href={l.href}
				aria-label={l.href === '/settings' ? l.label : undefined}
				title={l.href === '/settings' ? l.label : undefined}
				class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium {isActive(l.href)
					? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
					: 'text-neutral-600 dark:text-neutral-300'}"
			>
				{#if l.href === '/settings'}
					<Settings class="h-5 w-5" />
				{:else}
					{l.label}
				{/if}
			</a>
		{/each}
	</nav>
</header>
