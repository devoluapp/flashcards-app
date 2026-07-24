<script lang="ts">
	import { page } from '$app/state';
	import { pb, fileUrl, currentUser } from '$lib/pb';
	import type { CardRecord, DeckRecord } from '$lib/types';
	import { makeScheduler, toFsrsCard, stateName, Rating } from '$lib/fsrs';
	import { formatInterval } from '$lib/format';
	import RatingButtons from '$lib/components/RatingButtons.svelte';
	import HelpTip from '$lib/components/HelpTip.svelte';
	import { pushToast, errorMessage, isAbortError } from '$lib/stores/toast.svelte';
	import type { RecordLog } from 'ts-fsrs';

	const deckId = $derived(page.params.deckId as string);

	let deck = $state<DeckRecord | null>(null);
	let queue = $state<CardRecord[]>([]);
	let loading = $state(true);
	let revealed = $state(false);
	let grading = $state(false);
	let studiedCount = $state(0);
	let startedAt = $state(0);

	const scheduler = makeScheduler();
	const current = $derived(queue[0] ?? null);
	const preview = $derived<RecordLog | null>(current ? scheduler.repeat(toFsrsCard(current), new Date()) : null);
	const totalInSession = $derived(studiedCount + queue.length);
	const progressPct = $derived(totalInSession ? Math.round((studiedCount / totalInSession) * 100) : 0);

	async function load() {
		loading = true;
		try {
			const now = new Date().toISOString();
			[deck, queue] = await Promise.all([
				pb.collection('decks').getOne<DeckRecord>(deckId, { requestKey: null }),
				pb.collection('cards').getFullList<CardRecord>({
					filter: `deck="${deckId}" && due<="${now}" && suspended=false && deleted=false`,
					sort: 'due',
					requestKey: null
				})
			]);
			startedAt = Date.now();
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

	function reveal() {
		revealed = true;
	}

	async function grade(rating: Rating) {
		if (!current || !preview || grading) return;
		grading = true;
		const { card, log } = preview[rating as 1 | 2 | 3 | 4];
		const now = new Date();
		try {
			await pb.collection('cards').update(current.id, {
				due: card.due.toISOString(),
				stability: card.stability,
				difficulty: card.difficulty,
				elapsed_days: card.elapsed_days,
				scheduled_days: card.scheduled_days,
				reps: card.reps,
				lapses: card.lapses,
				state: stateName(card.state),
				last_review: (card.last_review ?? now).toISOString()
			});
			await pb.collection('review_logs').create({
				user: currentUser()!.id,
				card: current.id,
				rating: log.rating,
				state: stateName(log.state),
				due: log.due.toISOString(),
				stability: log.stability,
				difficulty: log.difficulty,
				elapsed_days: log.elapsed_days,
				last_elapsed_days: log.last_elapsed_days,
				scheduled_days: log.scheduled_days,
				review: log.review.toISOString(),
				duration_ms: Date.now() - startedAt
			});
			queue = queue.slice(1);
			studiedCount++;
			revealed = false;
			startedAt = Date.now();
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			grading = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (loading || !current) return;
		if (e.key === ' ') {
			e.preventDefault();
			if (!revealed) reveal();
			return;
		}
		if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
			const map: Record<string, Rating> = { '1': Rating.Again, '2': Rating.Hard, '3': Rating.Good, '4': Rating.Easy };
			grade(map[e.key]);
		}
	}

	const intervals = $derived.by(() => {
		if (!preview) return {};
		const now = new Date();
		const out: Record<number, string> = {};
		for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
			out[r] = formatInterval(now, preview[r as 1 | 2 | 3 | 4].card.due);
		}
		return out;
	});
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head><title>Estudar {deck?.name ?? ''} — Flashcards</title></svelte:head>

<div class="mx-auto max-w-xl">
	<div class="mb-4 flex items-center justify-between">
		<a href="/decks/{deckId}" class="text-sm text-neutral-500 hover:text-brand-600 dark:text-neutral-400 dark:hover:text-brand-400">← {deck?.name ?? 'Deck'}</a>
		<span class="text-sm text-neutral-500">{studiedCount}/{totalInSession}</span>
	</div>
	<div class="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
		<div class="h-full bg-brand-600 transition-all dark:bg-brand-500" style:width="{progressPct}%"></div>
	</div>

	{#if loading}
		<div class="h-72 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-900"></div>
	{:else if !current}
		<div class="rounded-2xl border border-neutral-200 bg-white p-12 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
			<div class="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40">
				<svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7" /></svg>
			</div>
			<h2 class="text-xl font-bold">Tudo em dia!</h2>
			<p class="mt-1 text-sm text-neutral-500">
				{studiedCount > 0 ? `Você revisou ${studiedCount} card${studiedCount === 1 ? '' : 's'}.` : 'Não há cards vencidos neste deck.'}
			</p>
			<a href="/decks/{deckId}" class="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
				>Voltar ao deck</a
			>
		</div>
	{:else}
		<div class="min-h-72 rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
			{#if current.front_image}
				<img
					src={fileUrl(current, current.front_image, { thumb: '800x600f' })}
					alt=""
					class="mb-4 max-h-56 w-full rounded-xl object-cover"
				/>
			{/if}
			<div class="max-w-none text-lg leading-relaxed [&_ul]:list-disc [&_ul]:pl-5">
				{@html current.front}
			</div>

			{#if revealed}
				<hr class="my-5 border-neutral-200 dark:border-neutral-800" />
				{#if current.back_image}
					<img
						src={fileUrl(current, current.back_image, { thumb: '800x600f' })}
						alt=""
						class="mb-4 max-h-56 w-full rounded-xl object-cover"
					/>
				{/if}
				<div class="max-w-none text-base leading-relaxed text-neutral-700 dark:text-neutral-300 [&_ul]:list-disc [&_ul]:pl-5">
					{@html current.back}
				</div>
			{/if}
		</div>

		<div class="mt-6">
			{#if !revealed}
				<button
					onclick={reveal}
					class="w-full rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
				>
					Mostrar resposta <span class="opacity-60">(espaço)</span>
				</button>
			{:else}
				<div class="mb-2 flex items-center justify-center gap-1.5 text-xs text-neutral-500">
					<span>Como você lembrou dessa resposta?</span>
					<HelpTip
						title="Como funciona a repetição espaçada"
						text={'Errei: você não lembrou. Difícil: lembrou, mas com esforço. Bom: lembrou tranquilo. Fácil: foi fácil demais. O sistema calcula sozinho quando te mostrar esse card de novo — quanto melhor você lembra, mais tempo ele espera pra te mostrar de novo. Seja honesto na resposta: é isso que faz o agendamento funcionar bem.'}
					/>
				</div>
				<RatingButtons {intervals} onRate={grade} disabled={grading} />
			{/if}
		</div>
	{/if}
</div>
