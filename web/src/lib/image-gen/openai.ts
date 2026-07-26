// Geração de imagem via API da OpenAI, chamada direto do navegador com a chave
// que o admin colou na tela (ver stores/adminKeys.svelte.ts). Custa dinheiro por
// imagem — a UI avisa antes.
import type { OpenAiImageModel } from '$lib/stores/adminKeys.svelte';

export const OPENAI_MODELS: { value: OpenAiImageModel; label: string }[] = [
	{ value: 'dall-e-3', label: 'DALL·E 3 (recomendado)' },
	{ value: 'gpt-image-1', label: 'GPT Image 1 (melhor, exige org verificada)' },
	{ value: 'dall-e-2', label: 'DALL·E 2 (mais barato)' }
];

interface GenerationResponse {
	data: { b64_json?: string; url?: string }[];
}

async function requestGeneration(body: Record<string, unknown>, apiKey: string): Promise<Response> {
	return fetch('https://api.openai.com/v1/images/generations', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
		body: JSON.stringify(body)
	});
}

async function errorDetail(res: Response): Promise<string> {
	try {
		return (await res.json())?.error?.message ?? '';
	} catch {
		return '';
	}
}

export async function generateImage(prompt: string, model: OpenAiImageModel, apiKey: string): Promise<Blob> {
	const body: Record<string, unknown> = { model, prompt, n: 1 };
	if (model === 'gpt-image-1') {
		body.size = '1024x1024';
		body.quality = 'medium';
	} else {
		body.size = model === 'dall-e-3' ? '1024x1024' : '512x512';
		// Pedimos b64_json (evita depender de CORS na URL da imagem), mas alguns
		// modelos/contas passaram a rejeitar o parâmetro — nesse caso repetimos sem ele.
		body.response_format = 'b64_json';
	}

	let res = await requestGeneration(body, apiKey);

	if (!res.ok) {
		let detail = await errorDetail(res);
		if (res.status === 400 && 'response_format' in body && detail.toLowerCase().includes('response_format')) {
			delete body.response_format;
			res = await requestGeneration(body, apiKey);
			if (!res.ok) detail = await errorDetail(res);
		}
		if (!res.ok) {
			if (res.status === 401) throw new Error('Chave da OpenAI inválida.');
			if (res.status === 429) throw new Error('Limite/cota da OpenAI atingido. ' + detail);
			throw new Error(detail || `OpenAI HTTP ${res.status}`);
		}
	}

	const json: GenerationResponse = await res.json();
	const first = json.data?.[0];

	if (first?.b64_json) {
		const bin = atob(first.b64_json);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return new Blob([bytes], { type: 'image/png' });
	}

	if (first?.url) {
		// Fallback quando a API devolve URL temporária em vez de base64.
		let imgRes: Response;
		try {
			imgRes = await fetch(first.url);
		} catch {
			throw new Error('A OpenAI devolveu uma URL que o navegador não conseguiu baixar (CORS). Tente outro modelo.');
		}
		if (!imgRes.ok) throw new Error(`Download da imagem gerada falhou (HTTP ${imgRes.status}).`);
		return imgRes.blob();
	}

	throw new Error('Resposta da OpenAI sem imagem.');
}
