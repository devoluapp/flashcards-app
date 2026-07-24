<script lang="ts">
	import { pb, fileUrl, currentUser } from '$lib/pb';
	import { auth } from '$lib/stores/auth.svelte';
	import { pushToast, errorMessage } from '$lib/stores/toast.svelte';
	import HelpTip from '$lib/components/HelpTip.svelte';
	import { theme, THEMES } from '$lib/stores/theme.svelte';
	import type { UserRecord } from '$lib/types';

	let name = $state(auth.user?.name ?? '');
	let timezone = $state(auth.user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
	let desiredRetention = $state(Math.round((auth.user?.desired_retention ?? 0.9) * 100));
	let savingProfile = $state(false);

	let oldPassword = $state('');
	let newPassword = $state('');
	let newPasswordConfirm = $state('');
	let savingPassword = $state(false);

	let avatarInput: HTMLInputElement;
	let avatarUploading = $state(false);

	const user = $derived(auth.user);
	const avatarUrl = $derived(user?.avatar ? fileUrl(user, user.avatar, { thumb: '100x100' }) : '');
	const storagePct = $derived(user ? Math.min(100, Math.round((user.storage_used / (50 * 1024 * 1024)) * 100)) : 0);

	async function saveProfile(e: Event) {
		e.preventDefault();
		savingProfile = true;
		try {
			await pb.collection('users').update<UserRecord>(currentUser()!.id, {
				name,
				timezone,
				desired_retention: desiredRetention / 100
			});
			pushToast('Preferências salvas.', 'success');
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			savingProfile = false;
		}
	}

	async function savePassword(e: Event) {
		e.preventDefault();
		if (newPassword !== newPasswordConfirm) {
			pushToast('As senhas não coincidem.', 'error');
			return;
		}
		savingPassword = true;
		try {
			await pb.collection('users').update(currentUser()!.id, {
				oldPassword,
				password: newPassword,
				passwordConfirm: newPasswordConfirm
			});
			pushToast('Senha alterada.', 'success');
			oldPassword = newPassword = newPasswordConfirm = '';
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			savingPassword = false;
		}
	}

	async function onAvatarChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		avatarUploading = true;
		try {
			const form = new FormData();
			form.append('avatar', file);
			await pb.collection('users').update(currentUser()!.id, form);
			pushToast('Avatar atualizado.', 'success');
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			avatarUploading = false;
			if (avatarInput) avatarInput.value = '';
		}
	}
</script>

<svelte:head><title>Configurações — Flashcards</title></svelte:head>

<div class="mx-auto max-w-xl space-y-6">
	<h1 class="text-2xl font-extrabold tracking-tight">Configurações</h1>

	<section class="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
		<h2 class="mb-4 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Perfil</h2>
		<div class="mb-4 flex items-center gap-4">
			{#if avatarUrl}
				<img src={avatarUrl} alt="" class="h-16 w-16 rounded-full object-cover" />
			{:else}
				<span class="grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
					{(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
				</span>
			{/if}
			<div>
				<input bind:this={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange={onAvatarChange} />
				<button
					onclick={() => avatarInput.click()}
					disabled={avatarUploading}
					class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
				>
					{avatarUploading ? 'Enviando…' : 'Trocar avatar'}
				</button>
				<p class="mt-1 text-xs text-neutral-500">{user?.email}</p>
			</div>
		</div>

		<form onsubmit={saveProfile} class="space-y-4">
			<div>
				<label for="name" class="mb-1 block text-sm font-medium">Nome</label>
				<input
					id="name"
					bind:value={name}
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
				/>
			</div>
			<div>
				<label for="timezone" class="mb-1 block text-sm font-medium">Fuso horário</label>
				<input
					id="timezone"
					bind:value={timezone}
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
				/>
			</div>
			<div>
				<div class="mb-1 flex items-center gap-1.5">
					<label for="retention" class="text-sm font-medium">Retenção-alvo (FSRS): {desiredRetention}%</label>
					<HelpTip
						title="O que é FSRS"
						text="FSRS é o algoritmo de repetição espaçada que decide quando cada card volta a aparecer — a mesma ideia por trás do Anki, mas calculada de forma mais precisa por card. A retenção-alvo é a chance que você quer ter de lembrar um card quando ele aparecer: 90% é um bom equilíbrio. Subir esse número gera mais revisões (mais seguro); descer gera menos revisões (mais rápido, mas com mais chance de esquecer)."
					/>
				</div>
				<input id="retention" type="range" min="70" max="99" bind:value={desiredRetention} class="w-full accent-brand-600" />
				<p class="mt-1 text-xs text-neutral-500">Quanto maior, mais revisões — e menor a chance de esquecer.</p>
			</div>
			<button
				type="submit"
				disabled={savingProfile}
				class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
			>
				{savingProfile ? 'Salvando…' : 'Salvar preferências'}
			</button>
		</form>
	</section>

	<section class="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
		<h2 class="mb-1 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Aparência</h2>
		<p class="mb-4 text-xs text-neutral-500">
			Escolha a cor de destaque do app. O modo claro/escuro continua seguindo a preferência do seu sistema.
		</p>
		<div class="flex flex-wrap gap-3" role="group" aria-label="Tema de cores">
			{#each THEMES as t (t.id)}
				<button
					type="button"
					onclick={() => theme.set(t.id)}
					aria-pressed={theme.current === t.id}
					class="flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-xs font-medium transition {theme.current ===
					t.id
						? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
						: 'border-transparent text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800'}"
				>
					<span class="grid h-8 w-8 place-items-center rounded-full ring-2 ring-white dark:ring-neutral-900" style:background-color={t.swatch}>
						{#if theme.current === t.id}
							<svg viewBox="0 0 24 24" class="h-4 w-4 text-white" fill="none" stroke="currentColor" stroke-width="3"
								><path d="M5 13l4 4L19 7" /></svg
							>
						{/if}
					</span>
					{t.label}
				</button>
			{/each}
		</div>
	</section>

	<section class="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
		<h2 class="mb-4 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Plano</h2>
		<div class="flex items-center justify-between">
			<div>
				<p class="text-lg font-bold capitalize">{user?.plan}</p>
				{#if user?.plan === 'free'}
					<p class="text-sm text-neutral-500">Até 3 decks · 50 MB de imagens</p>
				{/if}
			</div>
			{#if user?.plan === 'free'}
				<button
					disabled
					title="Upgrade ainda não disponível nesta versão"
					class="cursor-not-allowed rounded-lg bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-500 dark:bg-neutral-800"
					>Upgrade para Pro</button
				>
			{/if}
		</div>
		{#if user?.plan === 'free'}
			<div class="mt-4">
				<div class="mb-1 flex justify-between text-xs text-neutral-500">
					<span>Armazenamento de imagens</span>
					<span>{storagePct}%</span>
				</div>
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
					<div class="h-full bg-brand-600 dark:bg-brand-500" style:width="{storagePct}%"></div>
				</div>
			</div>
		{/if}
	</section>

	<section class="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
		<h2 class="mb-4 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Alterar senha</h2>
		<form onsubmit={savePassword} class="space-y-4">
			<div>
				<label for="oldPassword" class="mb-1 block text-sm font-medium">Senha atual</label>
				<input
					id="oldPassword"
					type="password"
					bind:value={oldPassword}
					required
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
				/>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="newPassword" class="mb-1 block text-sm font-medium">Nova senha</label>
					<input
						id="newPassword"
						type="password"
						minlength="8"
						bind:value={newPassword}
						required
						class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
					/>
				</div>
				<div>
					<label for="newPasswordConfirm" class="mb-1 block text-sm font-medium">Confirmar</label>
					<input
						id="newPasswordConfirm"
						type="password"
						minlength="8"
						bind:value={newPasswordConfirm}
						required
						class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
					/>
				</div>
			</div>
			<button
				type="submit"
				disabled={savingPassword}
				class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
			>
				{savingPassword ? 'Alterando…' : 'Alterar senha'}
			</button>
		</form>
	</section>
</div>
