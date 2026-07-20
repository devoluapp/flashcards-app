<script lang="ts">
	import { pb, currentUser } from '$lib/pb';
	import type { DeckRecord } from '$lib/types';
	import DeckCard from '$lib/components/DeckCard.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { pushToast, errorMessage } from '$lib/stores/toast.svelte';
	import { auth } from '$lib/stores/auth.svelte';

	let decks = $state<DeckRecord[]>([]);
	let dueCounts = $state<Record<string, number>>({});
	let totalCounts = $state<Record<string, number>>({});
	let loading = $state(true);

	let modalOpen = $state(false);
	let editing = $state<DeckRecord | null>(null);
	let name = $state('');
	let description = $state('');
	let color = $state('#2563eb');
	let saving = $state(false);

	const PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#d97706', '#16a34a', '#0891b2', '#4b5563'];

	async function load() {
		loading = true;
		try {
			decks = await pb.collection('decks').getFullList<DeckRecord>({
				filter: 'deleted = false',
				sort: '-created'
			});
			const now = new Date().toISOString();
			await Promise.all(
				decks.map(async (d) => {
					const [due, total] = await Promise.all([
						pb.collection('cards').getList(1, 1, {
							filter: `deck="${d.id}" && due <= "${now}" && suspended=false && deleted=false`,
							fields: 'id'
						}),
						pb.collection('cards').getList(1, 1, { filter: `deck="${d.id}" && deleted=false`, fields: 'id' })
					]);
					dueCounts[d.id] = due.totalItems;
					totalCounts[d.id] = total.totalItems;
				})
			);
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			loading = false;
		}
	}

	function openCreate() {
		editing = null;
		name = '';
		description = '';
		color = PALETTE[decks.length % PALETTE.length];
		modalOpen = true;
	}

	function openEdit(d: DeckRecord) {
		editing = d;
		name = d.name;
		description = d.description;
		color = d.color || PALETTE[0];
		modalOpen = true;
	}

	async function save(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			if (editing) {
				const updated = await pb.collection('decks').update<DeckRecord>(editing.id, { name, description, color });
				decks = decks.map((d) => (d.id === updated.id ? updated : d));
			} else {
				const created = await pb.collection('decks').create<DeckRecord>({ name, description, color });
				decks = [created, ...decks];
				dueCounts[created.id] = 0;
				totalCounts[created.id] = 0;
			}
			modalOpen = false;
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			saving = false;
		}
	}

	async function removeDeck(d: DeckRecord) {
		if (!confirm(`Excluir o deck "${d.name}" e todos os seus cards? Essa ação não pode ser desfeita.`)) return;
		try {
			await pb.collection('decks').delete(d.id);
			decks = decks.filter((x) => x.id !== d.id);
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		}
	}

	load();

	const user = $derived(currentUser());
	const deckLimit = $derived(user?.plan === 'free' ? 3 : Infinity);
</script>

<svelte:head><title>Decks — Flashcards</title></svelte:head>

<div class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-extrabold tracking-tight">Seus decks</h1>
		<p class="text-sm text-neutral-500">
			Olá, {auth.user?.name}! {#if user?.plan === 'free'}Plano free: {decks.length}/{deckLimit} decks.{/if}
		</p>
	</div>
	<button
		onclick={openCreate}
		disabled={decks.length >= deckLimit}
		class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
	>
		<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>
		Novo deck
	</button>
</div>

{#if loading}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each Array(3) as _}
			<div class="h-32 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-900"></div>
		{/each}
	</div>
{:else if decks.length === 0}
	<div class="rounded-2xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
		<p class="font-medium text-neutral-600 dark:text-neutral-300">Você ainda não tem nenhum deck.</p>
		<p class="mt-1 text-sm text-neutral-400">Crie o primeiro para começar a estudar.</p>
		<button onclick={openCreate} class="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
			>Criar deck</button
		>
	</div>
{:else}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each decks as deck (deck.id)}
			<DeckCard
				{deck}
				dueCount={dueCounts[deck.id] ?? 0}
				totalCount={totalCounts[deck.id] ?? 0}
				onEdit={() => openEdit(deck)}
				onDelete={() => removeDeck(deck)}
			/>
		{/each}
	</div>
{/if}

{#if modalOpen}
	<Modal title={editing ? 'Editar deck' : 'Novo deck'} onClose={() => (modalOpen = false)}>
		<form onsubmit={save} class="space-y-4">
			<div>
				<label for="deck-name" class="mb-1 block text-sm font-medium">Nome</label>
				<input
					id="deck-name"
					required
					maxlength="200"
					bind:value={name}
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-950"
				/>
			</div>
			<div>
				<label for="deck-desc" class="mb-1 block text-sm font-medium">Descrição (opcional)</label>
				<textarea
					id="deck-desc"
					bind:value={description}
					rows="2"
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-950"
				></textarea>
			</div>
			<div>
				<span class="mb-1 block text-sm font-medium">Cor</span>
				<div class="flex gap-2">
					{#each PALETTE as c (c)}
						<button
							type="button"
							aria-label="Cor {c}"
							onclick={() => (color = c)}
							class="h-7 w-7 rounded-full ring-offset-2 transition {color === c ? 'ring-2 ring-neutral-900 dark:ring-white' : ''}"
							style:background-color={c}
						></button>
					{/each}
				</div>
			</div>
			<button
				type="submit"
				disabled={saving}
				class="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
			>
				{saving ? 'Salvando…' : 'Salvar'}
			</button>
		</form>
	</Modal>
{/if}
