<script lang="ts">
	import Papa from 'papaparse';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pb } from '$lib/pb';
	import { auth } from '$lib/stores/auth.svelte';
	import type { CardRecord, DeckRecord } from '$lib/types';
	import type { AdminCardState } from '$lib/admin-import';
	import { ImageSearchSession } from '$lib/image-search/session.svelte';
	import { adminKeys } from '$lib/stores/adminKeys.svelte';
	import AiPromptHelper from '$lib/components/AiPromptHelper.svelte';
	import ApiKeysPanel from '$lib/components/admin/ApiKeysPanel.svelte';
	import CardImagePicker from '$lib/components/admin/CardImagePicker.svelte';
	import HelpTip from '$lib/components/HelpTip.svelte';
	import { pushToast, errorMessage, isAbortError } from '$lib/stores/toast.svelte';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';

	// Gating client-side (UX). A garantia real é o hook do backend: is_admin só
	// muda via superuser, e a tela só faz o que o usuário já pode nos próprios registros.
	// Em onMount (não $effect): goto() dentro de $effect rastreia estado interno do
	// router e entra em loop de navegação (effect_update_depth_exceeded).
	const isAdmin = $derived(!!auth.user?.is_admin);
	onMount(() => {
		if (auth.isValid && !isAdmin) {
			pushToast('Acesso restrito a administradores.', 'error');
			goto('/decks');
			return;
		}
		// /admin/import?deck=<id> reabre a edição de imagens de um deck já salvo
		// (entrada pelo botão "Imagens (admin)" na tela do deck).
		const deckParam = page.url.searchParams.get('deck');
		if (deckParam) loadExistingDeck(deckParam);
	});

	let step = $state<'form' | 'batch'>('form');
	let loadingDeck = $state(false);

	async function loadExistingDeck(id: string) {
		loadingDeck = true;
		try {
			const cards = await pb.collection('cards').getFullList<CardRecord>({
				filter: `deck="${id}" && deleted=false`,
				sort: 'created',
				requestKey: null
			});
			if (!cards.length) {
				pushToast('Este deck não tem cards para editar.', 'info');
				return;
			}
			items = cards.map((record) => ({
				record,
				imageSearch: record.image_search ?? '',
				imagePrompt: record.image_prompt ?? '',
				session: null,
				generated: null,
				selected: null,
				saving: false,
				saved: false,
				generating: false
			}));
			deckId = id;
			batchPage = 0;
			step = 'batch';
		} catch (err) {
			if (!isAbortError(err)) pushToast(errorMessage(err), 'error');
		} finally {
			loadingDeck = false;
		}
	}

	// --- Passo 1: formulário ---
	let decks = $state<DeckRecord[]>([]);
	let targetDeck = $state('');
	let newDeckName = $state('');
	let useNewDeck = $state(false);
	let csvMode = $state<'file' | 'paste'>('paste');
	let csvFile = $state<File | null>(null);
	let csvText = $state('');
	let importing = $state(false);
	let progress = $state({ done: 0, total: 0 });

	async function loadDecks() {
		try {
			decks = await pb.collection('decks').getFullList<DeckRecord>({
				filter: 'deleted=false',
				sort: 'name',
				requestKey: null
			});
			if (decks.length) targetDeck = decks[0].id;
		} catch (err) {
			if (isAbortError(err)) return;
			pushToast(errorMessage(err), 'error');
		}
	}
	loadDecks();

	// --- Passo 2: lote ---
	let items = $state<AdminCardState[]>([]);
	let deckId = $state('');
	let pageSize = $state(5);
	let batchPage = $state(0);

	const totalPages = $derived(Math.max(1, Math.ceil(items.length / pageSize)));
	const visibleItems = $derived(items.slice(batchPage * pageSize, batchPage * pageSize + pageSize));
	const savedCount = $derived(items.filter((i) => i.saved || i.record.back_image).length);

	// Busca lazy: só os cards visíveis criam sessão e disparam a primeira página
	// (poupa rate limit dos provedores). Card que já tem back_image (deck reaberto)
	// ganha a sessão mas não busca sozinho — o admin dispara com "Próximas".
	$effect(() => {
		for (const item of visibleItems) {
			if (!item.session && item.imageSearch.trim()) {
				item.session = new ImageSearchSession(item.imageSearch, {
					pixabay: adminKeys.pixabay,
					pexels: adminKeys.pexels,
					unsplash: adminKeys.unsplash
				});
				if (!item.record.back_image) item.session.next();
			}
		}
	});

	function setPageSize(n: number) {
		const firstVisible = batchPage * pageSize;
		pageSize = n;
		batchPage = Math.floor(firstVisible / n);
	}

	async function submit(e: Event) {
		e.preventDefault();
		importing = true;
		try {
			let text = csvText;
			if (csvMode === 'file') {
				if (!csvFile) throw new Error('Selecione um arquivo CSV.');
				text = await csvFile.text();
			}
			if (!text.trim()) throw new Error('Cole o texto CSV.');

			const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
			const fields = parsed.meta.fields ?? [];
			if (!fields.includes('front') || !fields.includes('back')) {
				throw new Error('O CSV precisa ter as colunas "front" e "back" no cabeçalho (use o prompt acima).');
			}
			const rows = parsed.data.filter((r) => r.front?.trim() && r.back?.trim());
			if (!rows.length) throw new Error('Nenhuma linha válida no CSV.');

			let deck = targetDeck;
			if (useNewDeck) {
				if (!newDeckName.trim()) throw new Error('Dê um nome ao novo deck.');
				const created = await pb.collection('decks').create<DeckRecord>({ name: newDeckName.trim() });
				decks = [created, ...decks];
				deck = created.id;
			}
			if (!deck) throw new Error('Escolha um deck de destino.');

			progress = { done: 0, total: rows.length };
			const created: AdminCardState[] = [];
			for (const row of rows) {
				const tags = (row.tags ?? '')
					.split(';')
					.map((t) => t.trim())
					.filter(Boolean);
				const imageSearch = row.image_search?.trim() ?? '';
				const imagePrompt = row.image_prompt?.trim() ?? '';
				const record = await pb.collection('cards').create<CardRecord>({
					deck,
					front: row.front.trim(),
					back: row.back.trim(),
					tags,
					source: 'admin-import',
					image_search: imageSearch,
					image_prompt: imagePrompt
				});
				created.push({
					record,
					imageSearch,
					imagePrompt,
					session: null,
					generated: null,
					selected: null,
					saving: false,
					saved: false,
					generating: false
				});
				progress = { done: created.length, total: rows.length };
			}

			deckId = deck;
			items = created;
			batchPage = 0;
			step = 'batch';
			pushToast(`${created.length} card(s) criado(s). Agora escolha as imagens.`, 'success');
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			importing = false;
		}
	}

	function onBeforeUnload(e: BeforeUnloadEvent) {
		const pendingImages = items.some((i) => !i.saved && !i.record.back_image && (i.imageSearch || i.imagePrompt));
		if (step === 'batch' && pendingImages) e.preventDefault();
	}
</script>

<svelte:head><title>Admin · Importar com imagens — Flashcards</title></svelte:head>
<svelte:window onbeforeunload={onBeforeUnload} />

<div class="mx-auto {step === 'form' ? 'max-w-xl' : 'max-w-3xl'}" hidden={!isAdmin}>
	<h1 class="mb-1 text-2xl font-extrabold tracking-tight">Importação com imagens (admin)</h1>
	<p class="mb-6 text-sm text-neutral-500">
		CSV com colunas de imagem mnemônica → cards criados na hora → edição em lote escolhendo imagem buscada ou gerada por IA.
	</p>

	{#if loadingDeck}
		<div class="space-y-4">
			{#each [0, 1, 2] as i (i)}
				<div class="h-40 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-900"></div>
			{/each}
		</div>
	{:else if step === 'form'}
		<div class="mb-4"><AiPromptHelper context="admin" /></div>
		<div class="mb-6"><ApiKeysPanel /></div>

		<form onsubmit={submit} class="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
			<div>
				<span class="mb-1.5 block text-sm font-medium">Deck de destino</span>
				<div class="flex items-center gap-2">
					<label class="flex items-center gap-1.5 text-sm">
						<input type="radio" checked={!useNewDeck} onchange={() => (useNewDeck = false)} />
						Existente
					</label>
					<label class="flex items-center gap-1.5 text-sm">
						<input type="radio" checked={useNewDeck} onchange={() => (useNewDeck = true)} />
						Novo deck
					</label>
				</div>
				{#if useNewDeck}
					<input
						bind:value={newDeckName}
						placeholder="Nome do novo deck"
						class="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
					/>
				{:else}
					<select
						bind:value={targetDeck}
						class="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
					>
						{#each decks as d (d.id)}
							<option value={d.id}>{d.name}</option>
						{/each}
					</select>
				{/if}
			</div>

			<div>
				<div class="mb-1.5 flex items-center justify-between">
					<div class="flex items-center gap-1.5">
						<span class="text-sm font-medium">Dados do CSV</span>
						<HelpTip
							title="Formato esperado"
							text="Cabeçalho front,back,tags,image_search,image_prompt (as três últimas são opcionais). Use o prompt de IA acima para gerar já neste formato."
						/>
					</div>
					<div class="flex gap-1.5">
						<button
							type="button"
							onclick={() => (csvMode = 'paste')}
							class="rounded-lg border px-2.5 py-1 text-xs font-medium {csvMode === 'paste'
								? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
								: 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'}"
						>
							Colar texto
						</button>
						<button
							type="button"
							onclick={() => (csvMode = 'file')}
							class="rounded-lg border px-2.5 py-1 text-xs font-medium {csvMode === 'file'
								? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
								: 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'}"
						>
							Enviar arquivo
						</button>
					</div>
				</div>
				{#if csvMode === 'file'}
					<input
						type="file"
						accept=".csv,text/csv"
						onchange={(e) => (csvFile = (e.target as HTMLInputElement).files?.[0] ?? null)}
						class="w-full text-sm"
					/>
				{:else}
					<textarea
						bind:value={csvText}
						rows="8"
						placeholder={'front,back,tags,image_search,image_prompt\n"Pergunta","Resposta",tag1;tag2,"eiffel tower paris","A giant golden Eiffel Tower..."'}
						class="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-950"
					></textarea>
				{/if}
			</div>

			<button
				type="submit"
				disabled={importing}
				class="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
			>
				{importing ? `Criando cards… ${progress.done}/${progress.total}` : 'Importar e escolher imagens'}
			</button>
		</form>
	{:else}
		<div class="mb-4"><ApiKeysPanel /></div>

		<div class="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
			<p class="text-sm">
				<strong>{savedCount}</strong> de <strong>{items.length}</strong> card(s) com imagem
			</p>
			<div class="ml-auto flex items-center gap-2">
				<label for="page-size" class="text-xs text-neutral-500">Por página:</label>
				<select
					id="page-size"
					value={pageSize}
					onchange={(e) => setPageSize(Number((e.target as HTMLSelectElement).value))}
					class="rounded-lg border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
				>
					{#each [1, 5, 10] as n (n)}
						<option value={n}>{n}</option>
					{/each}
				</select>
				<button
					type="button"
					onclick={() => (batchPage = Math.max(0, batchPage - 1))}
					disabled={batchPage === 0}
					class="rounded-lg border border-neutral-300 p-1.5 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
					aria-label="Página anterior"
				>
					<ChevronLeft class="h-4 w-4" />
				</button>
				<span class="text-xs text-neutral-500">Página {batchPage + 1} de {totalPages}</span>
				<button
					type="button"
					onclick={() => (batchPage = Math.min(totalPages - 1, batchPage + 1))}
					disabled={batchPage >= totalPages - 1}
					class="rounded-lg border border-neutral-300 p-1.5 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
					aria-label="Próxima página"
				>
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>
		</div>

		<div class="space-y-4">
			{#each visibleItems as item (item.record.id)}
				<CardImagePicker {item} />
			{/each}
		</div>

		<div class="mt-6 flex justify-end">
			<a
				href="/decks/{deckId}"
				class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
			>
				Concluir e ver deck
			</a>
		</div>
	{/if}
</div>
