<script lang="ts">
	import Cropper from 'cropperjs';
	import { onDestroy } from 'svelte';

	let {
		onCropped,
		aspectRatio = 4 / 3,
		maxSide = 1024
	}: { onCropped: (blob: Blob) => void; aspectRatio?: number; maxSide?: number } = $props();

	let fileInput: HTMLInputElement;
	let imgEl: HTMLImageElement | undefined = $state();
	let cropper: Cropper | null = null;
	let previewSrc = $state('');
	let cropping = $state(false);
	let busy = $state(false);

	const TEMPLATE = $derived(`
		<cropper-canvas background style="width:100%;height:320px">
			<cropper-image rotatable scalable skewable translatable></cropper-image>
			<cropper-shade hidden></cropper-shade>
			<cropper-handle action="select" plain></cropper-handle>
			<cropper-selection initial-coverage="0.8" aspect-ratio="${aspectRatio}" movable resizable>
				<cropper-grid role="grid" bordered covered></cropper-grid>
				<cropper-crosshair centered></cropper-crosshair>
				<cropper-handle action="move" theme-color="rgba(255,255,255,.35)"></cropper-handle>
				<cropper-handle action="n-resize"></cropper-handle>
				<cropper-handle action="e-resize"></cropper-handle>
				<cropper-handle action="s-resize"></cropper-handle>
				<cropper-handle action="w-resize"></cropper-handle>
				<cropper-handle action="ne-resize"></cropper-handle>
				<cropper-handle action="nw-resize"></cropper-handle>
				<cropper-handle action="se-resize"></cropper-handle>
				<cropper-handle action="sw-resize"></cropper-handle>
			</cropper-selection>
		</cropper-canvas>
	`);

	function pickFile() {
		fileInput.click();
	}

	function onFileChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (previewSrc) URL.revokeObjectURL(previewSrc);
		previewSrc = URL.createObjectURL(file);
		cropping = true;
	}

	$effect(() => {
		if (cropping && imgEl && previewSrc) {
			imgEl.src = previewSrc;
			cropper?.destroy();
			cropper = new Cropper(imgEl, { template: TEMPLATE });
		}
	});

	async function confirmCrop() {
		const selection = cropper?.getCropperSelection();
		if (!selection) return;
		busy = true;
		try {
			const width = maxSide;
			const height = Math.round(maxSide / aspectRatio);
			const canvas = await selection.$toCanvas({ width, height });
			const blob: Blob = await new Promise((resolve, reject) =>
				canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/webp', 0.8)
			);
			onCropped(blob);
			cancelCrop();
		} finally {
			busy = false;
		}
	}

	function cancelCrop() {
		cropper?.destroy();
		cropper = null;
		cropping = false;
		if (previewSrc) URL.revokeObjectURL(previewSrc);
		previewSrc = '';
		if (fileInput) fileInput.value = '';
	}

	onDestroy(() => {
		cropper?.destroy();
		if (previewSrc) URL.revokeObjectURL(previewSrc);
	});
</script>

<input bind:this={fileInput} type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange={onFileChange} />

{#if cropping}
	<div class="space-y-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
		<img bind:this={imgEl} alt="" />
		<div class="flex justify-end gap-2">
			<button
				type="button"
				onclick={cancelCrop}
				class="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
				>Cancelar</button
			>
			<button
				type="button"
				onclick={confirmCrop}
				disabled={busy}
				class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
				>{busy ? 'Cortando…' : 'Usar recorte (4:3)'}</button
			>
		</div>
	</div>
{:else}
	<button
		type="button"
		onclick={pickFile}
		class="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 hover:border-brand-400 hover:text-brand-600 dark:border-neutral-700"
	>
		<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"
			><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg
		>
		Adicionar imagem (recorte 4:3)
	</button>
{/if}
