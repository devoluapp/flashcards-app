import type { ImageProvider, SearchPage } from './types';

// https://www.pexels.com/api/documentation/ — chave vai no header Authorization.
interface PexelsPhoto {
	id: number;
	src: { tiny: string; medium: string };
	photographer: string;
	url: string;
}

export const pexels: ImageProvider = {
	id: 'pexels',
	label: 'Pexels',
	requiresKey: true,
	async search(query, page, perPage, apiKey): Promise<SearchPage> {
		const url = new URL('https://api.pexels.com/v1/search');
		url.searchParams.set('query', query);
		url.searchParams.set('page', String(page));
		url.searchParams.set('per_page', String(perPage));
		const res = await fetch(url, { headers: { Authorization: apiKey ?? '' } });
		if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
		const json: { photos: PexelsPhoto[]; next_page?: string } = await res.json();
		return {
			results: json.photos.map((p) => ({
				id: String(p.id),
				thumbUrl: p.src.tiny,
				fullUrl: p.src.medium,
				provider: 'pexels',
				author: p.photographer,
				pageUrl: p.url
			})),
			hasMore: !!json.next_page
		};
	}
};
