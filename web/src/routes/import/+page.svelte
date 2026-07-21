<script lang="ts">
	import { pb } from '$lib/pb';
	import type { DeckRecord, ImportJobRecord, ImportType } from '$lib/types';
	import HelpTip from '$lib/components/HelpTip.svelte';
	import AiPromptHelper from '$lib/components/AiPromptHelper.svelte';
	import { pushToast, errorMessage, isAbortError } from '$lib/stores/toast.svelte';

	let decks = $state<DeckRecord[]>([]);
	let type = $state<ImportType>('csv');
	let targetDeck = $state('');
	let newDeckName = $state('');
	let useNewDeck = $state(false);

	let csvMode = $state<'file' | 'paste'>('file');
	let csvFile = $state<File | null>(null);
	let csvText = $state('');
	let frontCol = $state('front');
	let backCol = $state('back');
	let tagsCol = $state('tags');
	let hasHeader = $state(true);

	let quizletText = $state('');
	let termSep = $state('\t');
	let cardSep = $state('\n');

	let ankiFile = $state<File | null>(null);

	let submitting = $state(false);
	let job = $state<ImportJobRecord | null>(null);
	let unsubscribe: (() => void) | null = null;

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

	function reset() {
		job = null;
		csvFile = null;
		csvText = '';
		ankiFile = null;
		quizletText = '';
	}

	async function submit(e: Event) {
		e.preventDefault();
		submitting = true;
		try {
			let deckId = targetDeck;
			if (useNewDeck) {
				if (!newDeckName.trim()) throw new Error('Dê um nome ao novo deck.');
				const created = await pb.collection('decks').create<DeckRecord>({ name: newDeckName.trim() });
				decks = [created, ...decks];
				deckId = created.id;
			}

			const form = new FormData();
			form.append('type', type);
			if (deckId) form.append('target_deck', deckId);

			if (type === 'csv') {
				if (csvMode === 'file') {
					if (!csvFile) throw new Error('Selecione um arquivo CSV.');
					form.append('file', csvFile);
				} else {
					if (!csvText.trim()) throw new Error('Cole o texto CSV.');
					form.append('file', new Blob([csvText], { type: 'text/csv' }), 'colado.csv');
				}
				form.append('options', JSON.stringify({ frontCol, backCol, tagsCol, hasHeader }));
			} else if (type === 'quizlet') {
				if (!quizletText.trim()) throw new Error('Cole o texto exportado do Quizlet.');
				form.append('file', new Blob([quizletText], { type: 'text/plain' }), 'quizlet.txt');
				form.append('options', JSON.stringify({ termSep, cardSep }));
			} else {
				if (!ankiFile) throw new Error('Selecione um arquivo .apkg.');
				form.append('file', ankiFile);
				form.append('options', JSON.stringify({}));
			}

			const created = await pb.collection('import_jobs').create<ImportJobRecord>(form);
			job = created;
			watch(created.id);
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			submitting = false;
		}
	}

	function watch(id: string) {
		unsubscribe?.();
		pb.collection('import_jobs')
			.subscribe<ImportJobRecord>(id, (e) => {
				job = e.record;
			})
			.then((unsub) => (unsubscribe = unsub));
	}

	$effect(() => () => unsubscribe?.());

	const STATUS_LABEL: Record<string, string> = {
		pending: 'Na fila…',
		processing: 'Processando…',
		done: 'Concluído',
		error: 'Erro'
	};
</script>

<svelte:head><title>Importar — Flashcards</title></svelte:head>

<div class="mx-auto max-w-xl">
	<h1 class="mb-1 text-2xl font-extrabold tracking-tight">Importar cards</h1>
	<p class="mb-6 text-sm text-neutral-500">De CSV, Quizlet (texto colado) ou Anki (.apkg). O processamento roda em segundo plano.</p>

	<div class="mb-6">
		<AiPromptHelper context="import" />
	</div>

	{#if job}
		<div class="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
			<div class="flex items-center gap-3">
				<span
					class="grid h-10 w-10 place-items-center rounded-full {job.status === 'done'
						? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40'
						: job.status === 'error'
							? 'bg-red-100 text-red-600 dark:bg-red-900/40'
							: 'bg-brand-100 text-brand-600 dark:bg-brand-900/40'}"
				>
					{#if job.status === 'done'}
						<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7" /></svg>
					{:else if job.status === 'error'}
						<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
					{:else}
						<svg viewBox="0 0 24 24" class="h-5 w-5 animate-spin" fill="none" stroke="currentColor" stroke-width="2"
							><path d="M12 3a9 9 0 1 0 9 9" /></svg
						>
					{/if}
				</span>
				<div>
					<p class="font-semibold">{STATUS_LABEL[job.status] ?? job.status}</p>
					<p class="text-xs text-neutral-500">Tipo: {job.type}</p>
				</div>
			</div>

			{#if job.status === 'done' && job.result}
				<p class="mt-4 text-sm text-neutral-600 dark:text-neutral-300">
					{job.result.created} de {job.result.total} card(s) importado(s) com sucesso.
				</p>
				<a href="/decks/{job.target_deck}" class="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
					>Ver deck</a
				>
			{:else if job.status === 'error' && job.result?.error}
				<p class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{job.result.error}</p>
				{#if job.result.error.includes('anki21b')}
					<p class="mt-2 text-xs text-neutral-500">
						No Anki: Arquivo → Exportar → marque "Support older Anki versions" e reexporte.
					</p>
				{/if}
			{/if}

			<button onclick={reset} class="mt-4 text-sm font-medium text-brand-600 hover:underline">Nova importação</button>
		</div>
	{:else}
		<form onsubmit={submit} class="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
			<div>
				<div class="mb-1.5 flex items-center gap-1.5">
					<span class="text-sm font-medium">Formato</span>
					<HelpTip
						title="Qual formato usar"
						text="CSV: arquivo exportado de planilha (Excel/Sheets) ou o texto que uma IA gerar pra você (veja a seção acima). Quizlet: cole o texto exportado do Quizlet. Anki: arquivo .apkg exportado do Anki (inclusive decks comprados de terceiros)."
					/>
				</div>
				<div class="grid grid-cols-3 gap-2">
					{#each [['csv', 'CSV'], ['quizlet', 'Quizlet'], ['anki', 'Anki']] as [v, label] (v)}
						<button
							type="button"
							onclick={() => (type = v as ImportType)}
							class="rounded-lg border py-2 text-sm font-medium {type === v
								? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
								: 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'}"
						>
							{label}
						</button>
					{/each}
				</div>
			</div>

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

			{#if type === 'csv'}
				<div class="space-y-3">
					<div>
						<div class="mb-1.5 flex items-center justify-between">
							<span class="text-sm font-medium">Dados do CSV</span>
							<div class="flex gap-1.5">
								<button
									type="button"
									onclick={() => (csvMode = 'file')}
									class="rounded-lg border px-2.5 py-1 text-xs font-medium {csvMode === 'file'
										? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
										: 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'}"
								>
									Enviar arquivo
								</button>
								<button
									type="button"
									onclick={() => (csvMode = 'paste')}
									class="rounded-lg border px-2.5 py-1 text-xs font-medium {csvMode === 'paste'
										? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
										: 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'}"
								>
									Colar texto
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
								rows="6"
								placeholder={'front,back,tags\n"Pergunta de exemplo","Resposta de exemplo",tag1;tag2'}
								class="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-950"
							></textarea>
							<p class="mt-1 text-xs text-neutral-500">Cole aqui o bloco CSV gerado pela IA (veja a seção acima).</p>
						{/if}
					</div>
					<div class="grid grid-cols-3 gap-2">
						<div>
							<div class="mb-1 flex items-center gap-1">
								<label for="frontCol" class="text-xs text-neutral-500">Coluna frente</label>
							</div>
							<input id="frontCol" bind:value={frontCol} class="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
						</div>
						<div>
							<label for="backCol" class="mb-1 block text-xs text-neutral-500">Coluna verso</label>
							<input id="backCol" bind:value={backCol} class="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
						</div>
						<div>
							<label for="tagsCol" class="mb-1 block text-xs text-neutral-500">Coluna tags</label>
							<input id="tagsCol" bind:value={tagsCol} class="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
						</div>
					</div>
					<div class="flex items-center gap-1.5">
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" bind:checked={hasHeader} />
							Primeira linha é cabeçalho
						</label>
						<HelpTip
							title="Nomes das colunas"
							text="Precisam bater com o cabeçalho do seu CSV. Se você usou o prompt de IA acima sem mudar o cabeçalho, deixe como está (front, back, tags)."
						/>
					</div>
				</div>
			{:else if type === 'quizlet'}
				<div class="space-y-3">
					<div>
						<div class="mb-1 flex items-center gap-1.5">
							<label for="quizletText" class="text-sm font-medium">Texto exportado do Quizlet</label>
							<HelpTip
								title="Como pegar esse texto"
								text={'No Quizlet: abra o set → menu "..." → Exportar. Copie o texto exportado (cada linha é um card, termo e definição separados por tab) e cole aqui.'}
							/>
						</div>
						<textarea
							id="quizletText"
							bind:value={quizletText}
							rows="6"
							placeholder={'termo' + termSep + 'definição'}
							class="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-950"
						></textarea>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<div>
							<label for="termSep" class="mb-1 block text-xs text-neutral-500">Delimitador termo/definição</label>
							<input id="termSep" bind:value={termSep} class="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
						</div>
						<div>
							<label for="cardSep" class="mb-1 block text-xs text-neutral-500">Delimitador entre cards</label>
							<input id="cardSep" bind:value={cardSep} class="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
						</div>
					</div>
				</div>
			{:else}
				<div>
					<span class="mb-1 block text-sm font-medium">Arquivo .apkg</span>
					<input
						type="file"
						accept=".apkg"
						onchange={(e) => (ankiFile = (e.target as HTMLInputElement).files?.[0] ?? null)}
						class="w-full text-sm"
					/>
					<p class="mt-1 text-xs text-neutral-500">Formatos anki2/anki21. Se der erro de "anki21b", reexporte marcando "Support older Anki versions".</p>
				</div>
			{/if}

			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
			>
				{submitting ? 'Enviando…' : 'Importar'}
			</button>
		</form>
	{/if}
</div>
