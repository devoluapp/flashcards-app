<script lang="ts">
	import { adminKeys, persistAdminKeys } from '$lib/stores/adminKeys.svelte';
	import { OPENAI_MODELS } from '$lib/image-gen/openai';
	import { PROVIDER_CHAIN } from '$lib/image-search/session.svelte';
	import { KeyRound, ChevronDown } from '@lucide/svelte';

	let expanded = $state(false);

	// Persiste no localStorage a cada alteração de qualquer chave/modelo.
	$effect(() => {
		JSON.stringify(adminKeys); // rastreia todos os campos
		persistAdminKeys();
	});

	const activeChain = $derived(
		PROVIDER_CHAIN.filter((p) => !p.requiresKey || adminKeys[p.id as 'pixabay' | 'pexels' | 'unsplash']?.trim())
			.map((p) => p.label)
			.join(' → ')
	);

	const FIELDS = [
		{ id: 'pixabay', label: 'Pixabay', hint: 'pixabay.com/api/docs — chave gratuita' },
		{ id: 'pexels', label: 'Pexels', hint: 'pexels.com/api — chave gratuita' },
		{ id: 'unsplash', label: 'Unsplash', hint: 'unsplash.com/developers — Access Key (demo: 50 req/h)' },
		{ id: 'openai', label: 'OpenAI', hint: 'platform.openai.com — usada só no botão "Gerar" (pago por imagem)' }
	] as const;
</script>

<div class="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
	<button type="button" onclick={() => (expanded = !expanded)} class="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
		<span class="flex items-center gap-2.5">
			<span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-800 text-white dark:bg-neutral-700">
				<KeyRound class="h-4 w-4" />
			</span>
			<span>
				<span class="block text-sm font-bold text-neutral-900 dark:text-neutral-50">Chaves de API</span>
				<span class="block text-xs text-neutral-500">
					Busca: {activeChain || 'nenhum provedor ativo'} · Geração: {adminKeys.openai ? adminKeys.openaiModel : 'sem chave OpenAI'}
				</span>
			</span>
		</span>
		<ChevronDown class="h-5 w-5 shrink-0 text-neutral-400 transition-transform {expanded ? 'rotate-180' : ''}" />
	</button>

	{#if expanded}
		<div class="space-y-4 border-t border-neutral-100 px-5 pb-5 pt-4 dark:border-neutral-800">
			<p class="text-xs text-neutral-500">
				As chaves ficam salvas <strong>só neste navegador</strong> (localStorage) — nunca vão pro servidor. Openverse não
				precisa de chave e é sempre usado como reserva. Ordem da busca: Pixabay → Pexels → Openverse → Unsplash.
			</p>

			<div class="grid gap-3 sm:grid-cols-2">
				{#each FIELDS as f (f.id)}
					<div>
						<label for="key-{f.id}" class="mb-1 block text-xs font-medium">{f.label}</label>
						<input
							id="key-{f.id}"
							type="password"
							bind:value={adminKeys[f.id]}
							placeholder="(sem chave)"
							autocomplete="off"
							class="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-950"
						/>
						<p class="mt-1 text-[11px] text-neutral-400">{f.hint}</p>
					</div>
				{/each}
			</div>

			<div>
				<label for="openai-model" class="mb-1 block text-xs font-medium">Modelo de geração (OpenAI)</label>
				<select
					id="openai-model"
					bind:value={adminKeys.openaiModel}
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm sm:max-w-xs dark:border-neutral-700 dark:bg-neutral-950"
				>
					{#each OPENAI_MODELS as m (m.value)}
						<option value={m.value}>{m.label}</option>
					{/each}
				</select>
			</div>
		</div>
	{/if}
</div>
