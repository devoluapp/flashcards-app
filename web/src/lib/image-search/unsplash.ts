import type { ImageProvider, SearchPage } from './types';

// https://unsplash.com/documentation — modo demo: 50 req/h. CDN (imgix) tem CORS.
interface UnsplashPhoto {
	id: string;
	urls: { thumb: string; small: string };
	user: { name: string };
	links: { html: string };
}

export const unsplash: ImageProvider = {
	id: 'unsplash',
	label: 'Unsplash',
	requiresKey: true,
	async search(query, page, perPage, apiKey): Promise<SearchPage> {
		const url = new URL('https://api.unsplash.com/search/photos');
		url.searchParams.set('query', query);
		url.searchParams.set('page', String(page));
		url.searchParams.set('per_page', String(perPage));
		const res = await fetch(url, { headers: { Authorization: `Client-ID ${apiKey ?? ''}` } });
		if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`);
		const json: { total_pages: number; results: UnsplashPhoto[] } = await res.json();
		return {
			results: json.results.map((p) => ({
				id: p.id,
				thumbUrl: p.urls.thumb,
				fullUrl: p.urls.small,
				provider: 'unsplash',
				author: p.user.name,
				pageUrl: p.links.html
			})),
			hasMore: page < json.total_pages
		};
	}
};
