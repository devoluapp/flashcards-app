<script lang="ts">
	import { pb, fileUrl } from '$lib/pb';
	import type { CardRecord } from '$lib/types';
	import Modal from '$lib/components/Modal.svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import ImageCropUploader from '$lib/components/ImageCropUploader.svelte';
	import HelpTip from '$lib/components/HelpTip.svelte';
	import AiPromptHelper from '$lib/components/AiPromptHelper.svelte';
	import { pushToast, errorMessage } from '$lib/stores/toast.svelte';

	let {
		deckId,
		card = null,
		onClose,
		onSaved
	}: { deckId: string; card?: CardRecord | null; onClose: () => void; onSaved: (c: CardRecord) => void } = $props();

	let front = $state(card?.front ?? '');
	let back = $state(card?.back ?? '');
	let tags = $state((card?.tags ?? []).join(', '));
	let saving = $state(false);

	let frontImageBlob = $state<Blob | null>(null);
	let backImageBlob = $state<Blob | null>(null);
	let frontImageRemoved = $state(false);
	let backImageRemoved = $state(false);

	const existingFrontUrl = $derived(
		card?.front_image && !frontImageRemoved ? fileUrl(card, card.front_image, { thumb: '400x300f' }) : ''
	);
	const existingBackUrl = $derived(
		card?.back_image && !backImageRemoved ? fileUrl(card, card.back_image, { thumb: '400x300f' }) : ''
	);
	const newFrontPreview = $derived(frontImageBlob ? URL.createObjectURL(frontImageBlob) : '');
	const newBackPreview = $derived(backImageBlob ? URL.createObjectURL(backImageBlob) : '');

	function stripHtml(html: string) {
		return html.replace(/<[^>]*>/g, '').trim();
	}

	async function save(e: Event) {
		e.preventDefault();
		if (!stripHtml(front) || !stripHtml(back)) {
			pushToast('Preencha frente e verso do card.', 'error');
			return;
		}
		saving = true;
		try {
			const form = new FormData();
			form.append('deck', deckId);
			form.append('front', front);
			form.append('back', back);
			const tagList = tags
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
			form.append('tags', JSON.stringify(tagList));

			if (frontImageBlob) form.append('front_image', frontImageBlob, 'front.webp');
			else if (frontImageRemoved) form.append('front_image', '');
			if (backImageBlob) form.append('back_image', backImageBlob, 'back.webp');
			else if (backImageRemoved) form.append('back_image', '');

			const saved = card
				? await pb.collection('cards').update<CardRecord>(card.id, form)
				: await pb.collection('cards').create<CardRecord>(form);
			pushToast(card ? 'Card atualizado.' : 'Card criado.', 'success');
			onSaved(saved);
		} catch (err) {
			pushToast(errorMessage(err), 'error');
		} finally {
			saving = false;
		}
	}
</script>

<Modal title={card ? 'Editar card' : 'Novo card'} {onClose} wide>
	<form onsubmit={save} class="space-y-4">
		{#if !card}
			<AiPromptHelper context="card" />
		{/if}

		<div>
			<div class="mb-1 flex items-center gap-1.5">
				<span class="text-sm font-medium">Frente</span>
				<HelpTip
					title="Dica"
					text="Prefira perguntas ou termos curtos e diretos — um conceito por card. Cards atômicos (uma pergunta, uma resposta) são mais fáceis de lembrar do que perguntas longas com várias informações misturadas."
				/>
			</div>
			<RichTextEditor bind:value={front} placeholder="Pergunta, termo ou conceito…" />
			{#if existingFrontUrl || newFrontPreview}
				<div class="relative mt-2 inline-block">
					<img src={newFrontPreview || existingFrontUrl} alt="" class="h-24 w-32 rounded-lg object-cover" />
					<button
						type="button"
						aria-label="Remover imagem da frente"
						onclick={() => {
							frontImageBlob = null;
							frontImageRemoved = true;
						}}
						class="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white shadow"
						>×</button
					>
				</div>
			{:else}
				<div class="mt-2">
					<ImageCropUploader
						onCropped={(b) => {
							frontImageBlob = b;
							frontImageRemoved = false;
						}}
					/>
				</div>
			{/if}
		</div>

		<div>
			<div class="mb-1 flex items-center gap-1.5">
				<span class="text-sm font-medium">Verso</span>
				<HelpTip
					title="Dica"
					text="Tente ser direto — respostas curtas grudam melhor na memória do que parágrafos inteiros. Se precisar, use negrito ou lista pra destacar o essencial."
				/>
			</div>
			<RichTextEditor bind:value={back} placeholder="Resposta, definição ou explicação…" />
			{#if existingBackUrl || newBackPreview}
				<div class="relative mt-2 inline-block">
					<img src={newBackPreview || existingBackUrl} alt="" class="h-24 w-32 rounded-lg object-cover" />
					<button
						type="button"
						aria-label="Remover imagem do verso"
						onclick={() => {
							backImageBlob = null;
							backImageRemoved = true;
						}}
						class="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white shadow"
						>×</button
					>
				</div>
			{:else}
				<div class="mt-2">
					<ImageCropUploader
						onCropped={(b) => {
							backImageBlob = b;
							backImageRemoved = false;
						}}
					/>
				</div>
			{/if}
		</div>

		<div>
			<div class="mb-1 flex items-center gap-1.5">
				<label for="card-tags" class="text-sm font-medium">Tags (separadas por vírgula)</label>
				<HelpTip
					title="Pra que servem"
					text="Ajudam a organizar cards por assunto dentro do mesmo deck (ex.: separar 'gramática' de 'vocabulário'). Não afetam o estudo nem o agendamento das revisões."
				/>
			</div>
			<input
				id="card-tags"
				bind:value={tags}
				placeholder="geografia, capitais"
				class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-950"
			/>
		</div>

		<button
			type="submit"
			disabled={saving}
			class="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
		>
			{saving ? 'Salvando…' : 'Salvar card'}
		</button>
	</form>
</Modal>
