// Contrato comum dos provedores de busca de imagem da tela admin.
// Todos são chamados direto do navegador; fullUrl PRECISA ser fetchável com CORS
// (é o que baixamos pra virar back_image do card).

export type ProviderId = 'pixabay' | 'pexels' | 'openverse' | 'unsplash';

export interface ImageResult {
	id: string;
	thumbUrl: string;
	/** URL da imagem em resolução de uso — precisa responder com Access-Control-Allow-Origin. */
	fullUrl: string;
	provider: ProviderId;
	author?: string;
	pageUrl?: string;
}

export interface SearchPage {
	results: ImageResult[];
	hasMore: boolean;
}

export interface ImageProvider {
	id: ProviderId;
	label: string;
	requiresKey: boolean;
	search(query: string, page: number, perPage: number, apiKey?: string): Promise<SearchPage>;
}
