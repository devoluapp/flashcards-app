<script lang="ts">
	// Editor de desenho livre (mouse, toque ou caneta) para imagens de card.
	// Duas camadas de canvas: a de baixo recebe fundo branco + imagem opcional
	// (pra desenhar por cima); a de cima é a superfície do signature_pad.
	// No confirmar, as camadas são compostas e comprimidas pra WebP <=2MB.
	// Overlay próprio (não usa Modal.svelte) para poder abrir por cima do
	// CardEditor, que já é um Modal.
	import SignaturePad from 'signature_pad';
	import { onMount, onDestroy } from 'svelte';
	import { blobToWebpResized } from '$lib/image-compress';
	import { pushToast, errorMessage } from '$lib/stores/toast.svelte';
	import { Undo2, Trash2 } from '@lucide/svelte';

	let {
		background = null,
		onDone,
		onClose,
		maxBytes = 2 * 1024 * 1024
	}: {
		/** Imagem de fundo pra desenhar por cima: Blob ou URL (mesma origem/CORS). */
		background?: Blob | string | null;
		onDone: (webp: Blob) => void;
		onClose: () => void;
		maxBytes?: number;
	} = $props();

	const COLORS = ['#111827', '#dc2626', '#ea580c', '#eab308', '#16a34a', '#2563eb', '#9333ea', '#ffffff'];
	const WIDTHS = [
		{ label: 'Fina', min: 1, max: 2.5, dot: 'h-1.5 w-1.5' },
		{ label: 'Média', min: 2.5, max: 5, dot: 'h-2.5 w-2.5' },
		{ label: 'Grossa', min: 5, max: 9, dot: 'h-4 w-4' }
	];

	let color = $state(COLORS[0]);
	let widthIdx = $state(1);
	let strokes = $state(0);
	let busy = $state(false);

	let containerEl: HTMLDivElement;
	let bgCanvas: HTMLCanvasElement;
	let drawCanvas: HTMLCanvasElement;
	let pad: SignaturePad | null = null;

	onMount(async () => {
		const ratio = Math.max(window.devicePixelRatio || 1, 1);
		const w = containerEl.offsetWidth;
		const h = Math.round((w * 3) / 4);
		for (const c of [bgCanvas, drawCanvas]) {
			c.width = w * ratio;
			c.height = h * ratio;
			c.style.width = `${w}px`;
			c.style.height = `${h}px`;
		}

		const ctx = bgCanvas.getContext('2d')!;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
		if (background) {
			try {
				const blob = typeof background === 'string' ? await (await fetch(background)).blob() : background;
				const bmp = await createImageBitmap(blob);
				const scale = Math.min(bgCanvas.width / bmp.width, bgCanvas.height / bmp.height);
				const dw = bmp.width * scale;
				const dh = bmp.height * scale;
				ctx.drawImage(bmp, (bgCanvas.width - dw) / 2, (bgCanvas.height - dh) / 2, dw, dh);
				bmp.close();
			} catch {
				pushToast('Não consegui carregar a imagem de fundo — desenhando em fundo branco.', 'info');
			}
		}

		drawCanvas.getContext('2d')!.scale(ratio, ratio);
		pad = new SignaturePad(drawCanvas, {
			penColor: color,
			minWidth: WIDTHS[widthIdx].min,
			maxWidth: WIDTHS[widthIdx].max,
			backgroundColor: 'rgba(0,0,0,0)'
		});
		pad.addEventListener('endStroke', () => (strokes = pad!.toData().length));
	});

	onDestroy(() => pad?.off());

	// Ler as dependências ANTES do early-return: na primeira execução `pad` ainda
	// é null e, se retornasse antes de ler `color`/`widthIdx`, o efeito não os
	// rastrearia e nunca mais rodaria.
	$effect(() => {
		const penColor = color;
		const w = WIDTHS[widthIdx];
		if (!pad) return;
		pad.penColor = penColor;
		pad.minWidth = w.min;
		pad.maxWidth = w.max;
	});

	function undo() {
		if (!pad) return;
		const data = pad.toData();
		data.pop();
		pad.fromData(data);
		strokes = data.length;
	}

	function clearAll() {
		pad?.clear();
		strokes = 0;
	}

	async function confirm() {
		busy = true;
		try {
			const out = document.createElement('canvas');
			out.width = drawCanvas.width;
			out.height = drawCanvas.height;
			const ctx = out.getContext('2d')!;
			ctx.drawImage(bgCanvas, 0, 0);
			ctx.drawImage(drawCanvas, 0, 0);
			const png = await new Promise<Blob>((resolve, reject) =>
				out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png')
			);
			onDone(await blobToWebpResized(png, { maxSide: 1024, maxBytes }));
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			busy = false;
		}
	}

	// Captura o Esc antes do Modal que estiver por baixo (senão fecharia os dois).
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
		}
	}
</script>

<svelte:window onkeydowncapture={onKeydown} />

<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="Editor de desenho">
	<div class="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl dark:bg-neutral-900">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="font-bold">Desenhar</h2>
			<button type="button" onclick={onClose} aria-label="Fechar" class="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
				<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
			</button>
		</div>

		<div class="mb-3 flex flex-wrap items-center gap-3">
			<div class="flex items-center gap-1.5">
				{#each COLORS as c (c)}
					<button
						type="button"
						aria-label="Cor {c}"
						onclick={() => (color = c)}
						class="h-6 w-6 rounded-full border border-neutral-300 dark:border-neutral-600 {color === c
							? 'ring-2 ring-brand-600 ring-offset-1 dark:ring-offset-neutral-900'
							: ''}"
						style="background:{c}"
					></button>
				{/each}
			</div>
			<div class="flex items-center gap-1">
				{#each WIDTHS as w, i (w.label)}
					<button
						type="button"
						title={w.label}
						onclick={() => (widthIdx = i)}
						class="grid h-8 w-8 place-items-center rounded-lg border {widthIdx === i
							? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30'
							: 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'}"
					>
						<span class="rounded-full bg-neutral-700 dark:bg-neutral-200 {w.dot}"></span>
					</button>
				{/each}
			</div>
			<div class="ml-auto flex items-center gap-1.5">
				<button
					type="button"
					onclick={undo}
					disabled={strokes === 0}
					class="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
				>
					<Undo2 class="h-3.5 w-3.5" /> Desfazer
				</button>
				<button
					type="button"
					onclick={clearAll}
					disabled={strokes === 0}
					class="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
				>
					<Trash2 class="h-3.5 w-3.5" /> Limpar
				</button>
			</div>
		</div>

		<div bind:this={containerEl} class="relative w-full overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
			<canvas bind:this={bgCanvas} class="block w-full"></canvas>
			<canvas bind:this={drawCanvas} class="absolute inset-0 cursor-crosshair touch-none"></canvas>
		</div>

		<div class="mt-3 flex justify-end gap-2">
			<button
				type="button"
				onclick={onClose}
				class="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
				>Cancelar</button
			>
			<button
				type="button"
				onclick={confirm}
				disabled={busy || (strokes === 0 && !background)}
				class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
				>{busy ? 'Salvando…' : 'Usar desenho'}</button
			>
		</div>
	</div>
</div>
