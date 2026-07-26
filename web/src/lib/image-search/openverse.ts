import type { ImageProvider, SearchPage } from './types';

// https://api.openverse.org/v1/ — sem chave (rate limit anônimo). O campo "url"
// aponta pra origem arbitrária SEM garantia de CORS; por isso usamos o endpoint
// de thumbnail (proxy da própria API, com CORS, ~600px) como thumb E full.
interface OpenverseResult {
	id: string;
	thumbnail: string;
	creator?: string;
	foreign_landing_url?: string;
}

export const openverse: ImageProvider = {
	id: 'openverse',
	label: 'Openverse',
	requiresKey: false,
	async search(query, page, perPage): Promise<SearchPage> {
		const url = new URL('https://api.openverse.org/v1/images/');
		url.searchParams.set('q', query);
		url.searchParams.set('page', String(page));
		url.searchParams.set('page_size', String(perPage));
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Openverse HTTP ${res.status}`);
		const json: { page_count: number; results: OpenverseResult[] } = await res.json();
		return {
			results: json.results.map((r) => ({
				id: r.id,
				thumbUrl: r.thumbnail,
				fullUrl: r.thumbnail,
				provider: 'openverse',
				author: r.creator,
				pageUrl: r.foreign_landing_url
			})),
			hasMore: page < json.page_count
		};
	}
};
