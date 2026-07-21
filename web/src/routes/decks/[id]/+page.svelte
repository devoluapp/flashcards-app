<script lang="ts">
	import { page } from '$app/state';
	import { pb, fileUrl } from '$lib/pb';
	import type { CardRecord, DeckRecord } from '$lib/types';
	import CardEditor from '$lib/components/CardEditor.svelte';
	import { pushToast, errorMessage, isAbortError } from '$lib/stores/toast.svelte';

	const deckId = $derived(page.params.id as string);

	let deck = $state<DeckRecord | null>(null);
	let cards = $state<CardRecord[]>([]);
	let loading = $state(true);
	let editorOpen = $state(false);
	let editingCard = $state<CardRecord | null>(null);

	async function load() {
		loading = true;
		try {
			[deck, cards] = await Promise.all([
				pb.collection('decks').getOne<DeckRecord>(deckId, { requestKey: null }),
				pb.collection('cards').getFullList<CardRecord>({
					filter: `deck="${deckId}" && deleted=false`,
					sort: 'due',
					requestKey: null
				})
			]);
		} catch (err) {
			if (isAbortError(err)) return;
			pushToast(errorMessage(err), 'error');
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (deckId) load();
	});

	function openCreate() {
		editingCard = null;
		editorOpen = true;
	}
	function openEdit(c: CardRecord) {
		editingCard = c;
		editorOpen = true;
	}
	function onSaved(c: CardRecord) {
		const i = cards.findIndex((x) => x.id === c.id);
		if (i === -1) cards = [c, ...cards];
		else cards = cards.map((x) => (x.id === c.id ? c : x));
		editorOpen = false;
	}

	async function removeCard(c: CardRecord) {
		if (!confirm('Excluir este card?')) return;
		try {
			await pb.collection('cards').delete(c.id);
			cards = cards.filter((x) => x.id !== c.id);
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		}
	}

	async function toggleSuspend(c: CardRecord) {
		try {
			const updated = await pb.collection('cards').update<CardRecord>(c.id, { suspended: !c.suspended });
			cards = cards.map((x) => (x.id === c.id ? updated : x));
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		}
	}

	function stripHtml(html: string) {
		return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
	}

	const dueCount = $derived(
		cards.filter((c) => !c.suspended && new Date(c.due || 0) <= new Date()).length
	);

	const STATE_LABEL: Record<string, string> = {
		new: 'Novo',
		learning: 'Aprendendo',
		review: 'Revisão',
		relearning: 'Reaprendendo'
	};
	const STATE_COLOR: Record<string, string> = {
		new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
		learning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
		review: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
		relearning: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
	};
</script>

<svelte:head><title>{deck?.name ?? 'Deck'} — Flashcards</title></svelte:head>

<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
	<div>
		<a href="/decks" class="text-sm text-neutral-500 hover:text-brand-600">← Decks</a>
		<h1 class="mt-1 text-2xl font-extrabold tracking-tight">{deck?.name ?? '...'}</h1>
		{#if deck?.description}<p class="text-sm text-neutral-500">{deck.description}</p>{/if}
	</div>
	<div class="flex items-center gap-2">
		{#if dueCount > 0}
			<a href="/study/{deckId}" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
				>Estudar ({dueCount})</a
			>
		{/if}
		<button onclick={openCreate} class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
			>+ Novo card</button
		>
	</div>
</div>

{#if loading}
	<div class="space-y-2">
		{#each Array(4) as _}
			<div class="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900"></div>
		{/each}
	</div>
{:else if cards.length === 0}
	<div class="rounded-2xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
		<p class="font-medium text-neutral-600 dark:text-neutral-300">Nenhum card ainda.</p>
		<button onclick={openCreate} class="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
			>Criar o primeiro card</button
		>
	</div>
{:else}
	<ul class="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
		{#each cards as c (c.id)}
			<li class="flex items-center gap-3 p-3 {c.suspended ? 'opacity-50' : ''}">
				{#if c.front_image}
					<img src={fileUrl(c, c.front_image, { thumb: '100x100' })} alt="" class="h-12 w-12 shrink-0 rounded-lg object-cover" />
				{/if}
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{stripHtml(c.front)}</p>
					<p class="truncate text-xs text-neutral-500">{stripHtml(c.back)}</p>
				</div>
				<span class="hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline {STATE_COLOR[c.state] ?? STATE_COLOR.new}">
					{STATE_LABEL[c.state] ?? 'Novo'}
				</span>
				<div class="flex shrink-0 gap-1">
					<button
						onclick={() => toggleSuspend(c)}
						title={c.suspended ? 'Reativar' : 'Suspender'}
						class="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
					>
						{#if c.suspended}
							<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-14 9V3z" /></svg>
						{:else}
							<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
						{/if}
					</button>
					<button onclick={() => openEdit(c)} title="Editar card" class="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
						<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5Z" /></svg>
					</button>
					<button onclick={() => removeCard(c)} title="Excluir card" class="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40">
						<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" /></svg>
					</button>
				</div>
			</li>
		{/each}
	</ul>
{/if}

{#if editorOpen}
	<CardEditor {deckId} card={editingCard} onClose={() => (editorOpen = false)} {onSaved} />
{/if}
