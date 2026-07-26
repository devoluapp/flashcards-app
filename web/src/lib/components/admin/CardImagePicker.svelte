<script lang="ts">
	import { pb, fileUrl } from '$lib/pb';
	import type { CardRecord } from '$lib/types';
	import type { AdminCardState } from '$lib/admin-import';
	import type { ImageResult } from '$lib/image-search/types';
	import { adminKeys } from '$lib/stores/adminKeys.svelte';
	import { ImageSearchSession } from '$lib/image-search/session.svelte';
	import { generateImage } from '$lib/image-gen/openai';
	import { blobToWebpResized, ImageTooLargeError } from '$lib/image-compress';
	import { pushToast, errorMessage } from '$lib/stores/toast.svelte';
	import { CheckCircle2, ChevronLeft, ChevronRight, Sparkles, ImageOff, LoaderCircle } from '@lucide/svelte';

	let { item }: { item: AdminCardState } = $props();

	const page = $derived(item.session?.current ?? null);
	const savedImageUrl = $derived(
		item.record.back_image ? fileUrl(item.record, item.record.back_image, { thumb: '400x300f' }) : ''
	);
	const genPrompt = $derived(item.imagePrompt.trim() || item.imageSearch.trim());
	// "Sujo" = campo editado difere do que está salvo no card (banco).
	const promptDirty = $derived(item.imagePrompt.trim() !== (item.record.image_prompt ?? ''));
	const searchDirty = $derived(item.imageSearch.trim() !== (item.record.image_search ?? ''));

	function isSelected(r: ImageResult): boolean {
		return item.selected?.kind === 'search' && item.selected.result.id === r.id && item.selected.result.provider === r.provider;
	}

	function toggleSearchSelect(r: ImageResult) {
		item.selected = isSelected(r) ? null : { kind: 'search', result: r };
	}

	function toggleGeneratedSelect() {
		item.selected = item.selected?.kind === 'generated' ? null : { kind: 'generated' };
	}

	// Persiste image_search/image_prompt no card (só a tela admin exibe esses
	// campos); se o termo de busca mudou, recomeça a busca com ele.
	// Guard de concorrência: o blur do campo (onchange) e o clique em
	// "Salvar e gerar" podem disparar quase juntos — compartilham o mesmo save.
	let metaSavePromise: Promise<void> | null = null;
	function persistImageMeta(): Promise<void> {
		metaSavePromise ??= doPersistImageMeta().finally(() => (metaSavePromise = null));
		return metaSavePromise;
	}

	async function doPersistImageMeta() {
		const search = item.imageSearch.trim();
		const prompt = item.imagePrompt.trim();
		if (search === item.record.image_search && prompt === item.record.image_prompt) return;
		const searchChanged = search !== item.record.image_search;
		try {
			item.record = await pb
				.collection('cards')
				.update<CardRecord>(item.record.id, { image_search: search, image_prompt: prompt });
			if (searchChanged) {
				if (item.selected?.kind === 'search') item.selected = null;
				item.session = new ImageSearchSession(search, {
					pixabay: adminKeys.pixabay,
					pexels: adminKeys.pexels,
					unsplash: adminKeys.unsplash
				});
				item.session.next();
			}
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		}
	}

	async function generate() {
		if (!adminKeys.openai.trim()) {
			pushToast('Configure a chave da OpenAI no painel "Chaves de API" acima.', 'error');
			return;
		}
		if (!genPrompt) {
			pushToast('Preencha o prompt de geração (ou a busca) deste card.', 'error');
			return;
		}
		// "Salvar e gerar": persiste os campos editados antes de gerar.
		if (promptDirty || searchDirty) await persistImageMeta();
		item.generating = true;
		try {
			const blob = await generateImage(genPrompt, adminKeys.openaiModel, adminKeys.openai.trim());
			if (item.generated) URL.revokeObjectURL(item.generated.url);
			item.generated = { blob, url: URL.createObjectURL(blob) };
			item.selected = { kind: 'generated' };
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			item.generating = false;
		}
	}

	async function saveSelected() {
		if (!item.selected) return;
		item.saving = true;
		try {
			let raw: Blob;
			if (item.selected.kind === 'generated') {
				if (!item.generated) throw new Error('Imagem gerada não está mais disponível.');
				raw = item.generated.blob;
			} else {
				const res = await fetch(item.selected.result.fullUrl);
				if (!res.ok) throw new Error(`Download da imagem falhou (HTTP ${res.status}).`);
				raw = await res.blob();
			}

			const webp = await blobToWebpResized(raw, { maxSide: 1024, maxBytes: 2 * 1024 * 1024 });
			const form = new FormData();
			form.append('back_image', webp, 'back.webp');
			item.record = await pb.collection('cards').update<CardRecord>(item.record.id, form);
			item.saved = true;
			pushToast('Imagem salva no verso do card.', 'success');
		} catch (err) {
			if (err instanceof ImageTooLargeError) {
				pushToast('A imagem ficou grande demais mesmo comprimida. Tente outra.', 'error');
			} else if (err instanceof TypeError) {
				// fetch bloqueado (CORS/rede) — o provedor não permite baixar direto do navegador
				pushToast('Não consegui baixar essa imagem (bloqueio CORS). Escolha outra ou use "Gerar".', 'error');
			} else {
				pushToast(errorMessage(err), 'error');
			}
		} finally {
			item.saving = false;
		}
	}
</script>

<div class="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
	<div class="mb-3 flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="font-semibold break-words">{item.record.front}</p>
			<p class="mt-0.5 text-sm break-words text-neutral-500">{item.record.back}</p>
		</div>
		{#if item.saved || item.record.back_image}
			<span class="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
				<CheckCircle2 class="h-3.5 w-3.5" /> Imagem salva
			</span>
		{/if}
	</div>

	{#if savedImageUrl}
		<img src={savedImageUrl} alt="Imagem atual do verso" class="mb-3 h-24 rounded-lg object-cover" />
	{/if}

	<div class="mb-3 grid gap-2 sm:grid-cols-2">
		<div>
			<label for="search-{item.record.id}" class="mb-1 block text-xs font-medium text-neutral-500">
				Busca de imagem (image_search)
			</label>
			<input
				id="search-{item.record.id}"
				bind:value={item.imageSearch}
				onchange={persistImageMeta}
				placeholder="ex.: eiffel tower paris"
				class="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
			/>
		</div>
		<div>
			<label for="prompt-{item.record.id}" class="mb-1 block text-xs font-medium text-neutral-500">
				Prompt de geração (image_prompt)
			</label>
			<textarea
				id="prompt-{item.record.id}"
				bind:value={item.imagePrompt}
				onchange={persistImageMeta}
				rows="1"
				placeholder="ex.: A giant golden Eiffel Tower..., no text"
				class="w-full resize-y rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
			></textarea>
		</div>
	</div>

	{#if !item.imageSearch && !item.imagePrompt}
		<p class="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-500 dark:bg-neutral-950">
			Preencha a busca e/ou o prompt acima para habilitar as imagens deste card.
		</p>
	{:else}
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			{#if item.session?.loading}
				{#each [0, 1, 2] as i (i)}
					<div class="grid aspect-[4/3] animate-pulse place-items-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
						<LoaderCircle class="h-5 w-5 animate-spin text-neutral-400" />
					</div>
				{/each}
			{:else if page}
				{#each page.results as r (r.provider + r.id)}
					<button
						type="button"
						onclick={() => toggleSearchSelect(r)}
						class="group relative aspect-[4/3] overflow-hidden rounded-xl border-2 {isSelected(r)
							? 'border-brand-600 ring-2 ring-brand-600/50'
							: 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-600'}"
						title={r.author ? `${page.providerLabel} · ${r.author}` : page.providerLabel}
					>
						<img src={r.thumbUrl} alt="" loading="lazy" class="h-full w-full object-cover" />
						{#if isSelected(r)}
							<span class="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-white">
								<CheckCircle2 class="h-4 w-4" />
							</span>
						{/if}
						<span class="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-0.5 text-left text-[10px] text-white">
							{page.providerLabel}{r.author ? ` · ${r.author}` : ''}
						</span>
					</button>
				{/each}
			{:else if item.session?.exhausted}
				<div class="col-span-2 grid place-items-center rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500 sm:col-span-3 dark:bg-neutral-950">
					<span class="flex items-center gap-2"><ImageOff class="h-4 w-4" /> Nenhum resultado na busca — tente "Gerar".</span>
				</div>
			{/if}

			<!-- Slot da imagem gerada pela OpenAI -->
			{#if item.generated}
				<button
					type="button"
					onclick={toggleGeneratedSelect}
					class="relative aspect-[4/3] overflow-hidden rounded-xl border-2 {item.selected?.kind === 'generated'
						? 'border-brand-600 ring-2 ring-brand-600/50'
						: 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-600'}"
				>
					<img src={item.generated.url} alt="Imagem gerada por IA" class="h-full w-full object-cover" />
					{#if item.selected?.kind === 'generated'}
						<span class="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-white">
							<CheckCircle2 class="h-4 w-4" />
						</span>
					{/if}
					<span class="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-0.5 text-left text-[10px] text-white">
						Gerada · {adminKeys.openaiModel}
					</span>
				</button>
			{:else if item.generating}
				<div class="grid aspect-[4/3] animate-pulse place-items-center rounded-xl bg-brand-50 dark:bg-brand-900/20">
					<LoaderCircle class="h-5 w-5 animate-spin text-brand-500" />
				</div>
			{/if}
		</div>

		<div class="mt-3 flex flex-wrap items-center gap-2">
			<button
				type="button"
				onclick={() => item.session?.prev()}
				disabled={!item.session?.canPrev || item.session?.loading}
				class="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
			>
				<ChevronLeft class="h-3.5 w-3.5" /> Anteriores
			</button>
			<button
				type="button"
				onclick={() => item.session?.next()}
				disabled={!item.session?.canNext || item.session?.loading}
				class="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
			>
				Próximas <ChevronRight class="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				onclick={generate}
				disabled={item.generating || !genPrompt}
				class="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/30"
				title="Gera uma imagem com a OpenAI a partir do prompt de geração (pago por imagem)"
			>
				<Sparkles class="h-3.5 w-3.5" />
				{item.generating ? 'Gerando…' : promptDirty ? 'Salvar e gerar' : item.generated ? 'Regerar' : 'Gerar'}
			</button>

			<button
				type="button"
				onclick={saveSelected}
				disabled={!item.selected || item.saving}
				class="ml-auto rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
			>
				{item.saving ? 'Salvando…' : 'Usar como imagem do verso'}
			</button>
		</div>
	{/if}
</div>
