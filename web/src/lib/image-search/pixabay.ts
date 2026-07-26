import type { ImageProvider, SearchPage } from './types';

// https://pixabay.com/api/docs/ — per_page mínimo aceito é 3; CDN responde com CORS.
interface PixabayHit {
	id: number;
	previewURL: string;
	webformatURL: string;
	user: string;
	pageURL: string;
}

export const pixabay: ImageProvider = {
	id: 'pixabay',
	label: 'Pixabay',
	requiresKey: true,
	async search(query, page, perPage, apiKey): Promise<SearchPage> {
		const url = new URL('https://pixabay.com/api/');
		url.searchParams.set('key', apiKey ?? '');
		url.searchParams.set('q', query);
		url.searchParams.set('page', String(page));
		url.searchParams.set('per_page', String(Math.max(3, perPage)));
		url.searchParams.set('safesearch', 'true');
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
		const json: { totalHits: number; hits: PixabayHit[] } = await res.json();
		return {
			results: json.hits.slice(0, perPage).map((h) => ({
				id: String(h.id),
				thumbUrl: h.previewURL,
				fullUrl: h.webformatURL,
				provider: 'pixabay',
				author: h.user,
				pageUrl: h.pageURL
			})),
			hasMore: page * perPage < json.totalHits
		};
	}
};
