<script lang="ts">
	import { pb, currentUser } from '$lib/pb';
	import type { CardRecord, ReviewLogRecord } from '$lib/types';
	import Chart from 'chart.js/auto';
	import { pushToast, errorMessage, isAbortError } from '$lib/stores/toast.svelte';

	let loading = $state(true);
	let logs = $state<ReviewLogRecord[]>([]);
	let cards = $state<CardRecord[]>([]);

	let reviewsCanvas: HTMLCanvasElement | undefined = $state();
	let ratingCanvas: HTMLCanvasElement | undefined = $state();
	let forecastCanvas: HTMLCanvasElement | undefined = $state();
	let charts: Chart[] = [];

	const DAYS_BACK = 30;
	const DAYS_FORWARD = 14;

	async function load() {
		loading = true;
		try {
			const since = new Date(Date.now() - DAYS_BACK * 86400000).toISOString();
			[logs, cards] = await Promise.all([
				pb.collection('review_logs').getFullList<ReviewLogRecord>({
					filter: `review >= "${since}"`,
					sort: 'review',
					requestKey: null
				}),
				pb.collection('cards').getFullList<CardRecord>({
					filter: 'deleted=false && suspended=false',
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
	load();

	function dayKey(d: Date) {
		return d.toISOString().slice(0, 10);
	}

	function buildCharts() {
		charts.forEach((c) => c.destroy());
		charts = [];
		if (!reviewsCanvas || !ratingCanvas || !forecastCanvas) return;

		// Lê a cor de destaque do tema ativo (ver lib/stores/theme.svelte.ts) em vez de
		// fixar o azul padrão, pra os gráficos acompanharem o tema escolhido em Configurações.
		const brand600 = getComputedStyle(document.documentElement).getPropertyValue('--color-brand-600').trim() || '#2563eb';

		// revisões por dia (últimos 30 dias)
		const dayBuckets: Record<string, number> = {};
		for (let i = DAYS_BACK - 1; i >= 0; i--) {
			dayBuckets[dayKey(new Date(Date.now() - i * 86400000))] = 0;
		}
		for (const l of logs) {
			const k = dayKey(new Date(l.review));
			if (k in dayBuckets) dayBuckets[k]++;
		}
		charts.push(
			new Chart(reviewsCanvas, {
				type: 'bar',
				data: {
					labels: Object.keys(dayBuckets).map((k) => k.slice(5)),
					datasets: [{ label: 'Revisões', data: Object.values(dayBuckets), backgroundColor: brand600, borderRadius: 4 }]
				},
				options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 10 } } } }
			})
		);

		// distribuição de notas
		const ratingCounts = [0, 0, 0, 0];
		for (const l of logs) ratingCounts[l.rating - 1]++;
		charts.push(
			new Chart(ratingCanvas, {
				type: 'doughnut',
				data: {
					labels: ['Errei', 'Difícil', 'Bom', 'Fácil'],
					datasets: [{ data: ratingCounts, backgroundColor: ['#dc2626', '#f59e0b', '#10b981', brand600] }]
				},
				options: { plugins: { legend: { position: 'bottom' } } }
			})
		);

		// previsão de carga (próximos 14 dias)
		const forecast: Record<string, number> = {};
		for (let i = 0; i < DAYS_FORWARD; i++) forecast[dayKey(new Date(Date.now() + i * 86400000))] = 0;
		for (const c of cards) {
			if (!c.due) continue;
			const k = dayKey(new Date(c.due));
			if (k in forecast) forecast[k]++;
		}
		charts.push(
			new Chart(forecastCanvas, {
				type: 'bar',
				data: {
					labels: Object.keys(forecast).map((k) => k.slice(5)),
					datasets: [{ label: 'Cards vencendo', data: Object.values(forecast), backgroundColor: '#7c3aed', borderRadius: 4 }]
				},
				options: { plugins: { legend: { display: false } } }
			})
		);
	}

	$effect(() => {
		if (!loading) buildCharts();
		return () => charts.forEach((c) => c.destroy());
	});

	const totalReviews = $derived(logs.length);
	const successRate = $derived(
		totalReviews ? Math.round((logs.filter((l) => l.rating >= 3).length / totalReviews) * 100) : null
	);
	const targetRetention = $derived(Math.round((currentUser()?.desired_retention ?? 0.9) * 100));
	const dueToday = $derived(cards.filter((c) => c.due && new Date(c.due) <= new Date()).length);
</script>

<svelte:head><title>Estatísticas — Flashcards</title></svelte:head>

<h1 class="mb-6 text-2xl font-extrabold tracking-tight">Estatísticas</h1>

{#if loading}
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
		{#each Array(4) as _}<div class="h-24 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-900"></div>{/each}
	</div>
{:else}
	<div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
		<div class="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
			<p class="text-xs text-neutral-500">Revisões (30d)</p>
			<p class="mt-1 text-2xl font-extrabold">{totalReviews}</p>
		</div>
		<div class="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
			<p class="text-xs text-neutral-500">Retenção real</p>
			<p class="mt-1 text-2xl font-extrabold">{successRate !== null ? `${successRate}%` : '—'}</p>
		</div>
		<div class="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
			<p class="text-xs text-neutral-500">Meta de retenção</p>
			<p class="mt-1 text-2xl font-extrabold">{targetRetention}%</p>
		</div>
		<div class="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
			<p class="text-xs text-neutral-500">Vencidos hoje</p>
			<p class="mt-1 text-2xl font-extrabold">{dueToday}</p>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
		<div class="rounded-2xl border border-neutral-200 bg-white p-4 lg:col-span-2 dark:border-neutral-800 dark:bg-neutral-900">
			<h2 class="mb-3 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Revisões por dia (30d)</h2>
			<div class="h-56"><canvas bind:this={reviewsCanvas}></canvas></div>
		</div>
		<div class="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
			<h2 class="mb-3 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Distribuição de notas</h2>
			<div class="h-56"><canvas bind:this={ratingCanvas}></canvas></div>
		</div>
		<div class="rounded-2xl border border-neutral-200 bg-white p-4 lg:col-span-3 dark:border-neutral-800 dark:bg-neutral-900">
			<h2 class="mb-3 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Carga prevista (próximos 14 dias)</h2>
			<div class="h-56"><canvas bind:this={forecastCanvas}></canvas></div>
		</div>
	</div>
{/if}
