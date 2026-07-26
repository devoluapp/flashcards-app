// Geração de imagem via API da OpenAI, chamada direto do navegador com a chave
// que o admin colou na tela (ver stores/adminKeys.svelte.ts). Custa dinheiro por
// imagem — a UI avisa antes.
import type { OpenAiImageModel } from '$lib/stores/adminKeys.svelte';

export const OPENAI_MODELS: { value: OpenAiImageModel; label: string }[] = [
	{ value: 'dall-e-3', label: 'DALL·E 3 (recomendado)' },
	{ value: 'gpt-image-1', label: 'GPT Image 1 (melhor, exige org verificada)' },
	{ value: 'dall-e-2', label: 'DALL·E 2 (mais barato)' }
];

export async function generateImage(prompt: string, model: OpenAiImageModel, apiKey: string): Promise<Blob> {
	const body: Record<string, unknown> = { model, prompt, n: 1 };
	if (model === 'gpt-image-1') {
		// já responde b64_json; rejeita o parâmetro response_format
		body.size = '1024x1024';
		body.quality = 'medium';
	} else {
		body.size = model === 'dall-e-3' ? '1024x1024' : '512x512';
		body.response_format = 'b64_json';
	}

	const res = await fetch('https://api.openai.com/v1/images/generations', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		let detail = '';
		try {
			detail = (await res.json())?.error?.message ?? '';
		} catch {
			/* corpo não-JSON */
		}
		if (res.status === 401) throw new Error('Chave da OpenAI inválida.');
		if (res.status === 429) throw new Error('Limite/cota da OpenAI atingido. ' + detail);
		throw new Error(detail || `OpenAI HTTP ${res.status}`);
	}

	const json: { data: { b64_json?: string }[] } = await res.json();
	const b64 = json.data?.[0]?.b64_json;
	if (!b64) throw new Error('Resposta da OpenAI sem imagem.');

	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new Blob([bytes], { type: 'image/png' });
}
