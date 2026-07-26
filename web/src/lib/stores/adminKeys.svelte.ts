// Chaves de API da tela admin (/admin/import), persistidas SÓ no localStorage
// deste navegador — nunca vão pro PocketBase nem pro bundle. localStorage é
// legível por qualquer script da origem; aceitável aqui por ser ferramenta
// pessoal de admin com chaves gratuitas/de baixo risco do próprio usuário.
export type OpenAiImageModel = 'gpt-image-1' | 'dall-e-3' | 'dall-e-2';

const STORAGE_KEY = 'admin_api_keys';

function load(): Record<string, string> {
	if (typeof localStorage === 'undefined') return {};
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

const stored = load();

export const adminKeys = $state({
	pixabay: stored.pixabay ?? '',
	pexels: stored.pexels ?? '',
	unsplash: stored.unsplash ?? '',
	openai: stored.openai ?? '',
	openaiModel: (stored.openaiModel as OpenAiImageModel) || 'dall-e-3'
});

export function persistAdminKeys() {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(adminKeys));
}
