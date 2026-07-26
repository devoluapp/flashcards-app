// Sessão de busca de imagens de UM card na tela admin: percorre a cadeia de
// provedores (do melhor pro menos adequado a imagem ilustrativa/mnemônica),
// paginando de PER_PAGE em PER_PAGE e cacheando as páginas já vistas — "próximas"
// só bate na rede quando avança além do cache; "anteriores" navega só no cache.
// Provedor que exige chave e não tem fica fora; erro/429 pula pro próximo.
import type { ImageProvider, ImageResult, ProviderId } from './types';
import { pixabay } from './pixabay';
import { pexels } from './pexels';
import { openverse } from './openverse';
import { unsplash } from './unsplash';

export const PROVIDER_CHAIN: ImageProvider[] = [pixabay, pexels, openverse, unsplash];
export const PER_PAGE = 3;

export interface SearchPageEntry {
	provider: ProviderId;
	providerLabel: string;
	results: ImageResult[];
}

export class ImageSearchSession {
	private chain: { provider: ImageProvider; key?: string }[];
	private chainIdx = 0;
	private nextProviderPage = 1;

	pages = $state<SearchPageEntry[]>([]);
	pageIndex = $state(-1);
	loading = $state(false);
	exhausted = $state(false);

	constructor(
		private query: string,
		keys: Partial<Record<ProviderId, string>>
	) {
		this.chain = PROVIDER_CHAIN.filter((p) => !p.requiresKey || keys[p.id]?.trim()).map((p) => ({
			provider: p,
			key: keys[p.id]?.trim()
		}));
		if (!query.trim()) this.exhausted = true;
	}

	get current(): SearchPageEntry | null {
		return this.pageIndex >= 0 ? (this.pages[this.pageIndex] ?? null) : null;
	}

	get canPrev(): boolean {
		return this.pageIndex > 0;
	}

	get canNext(): boolean {
		return this.pageIndex + 1 < this.pages.length || !this.exhausted;
	}

	prev() {
		if (this.canPrev) this.pageIndex--;
	}

	/** Avança uma página: do cache se já buscada, senão busca no provedor atual da cadeia. */
	async next(): Promise<void> {
		if (this.pageIndex + 1 < this.pages.length) {
			this.pageIndex++;
			return;
		}
		if (this.exhausted || this.loading) return;
		this.loading = true;
		try {
			while (this.chainIdx < this.chain.length) {
				const { provider, key } = this.chain[this.chainIdx];
				let page;
				try {
					page = await provider.search(this.query, this.nextProviderPage, PER_PAGE, key);
				} catch {
					// 429/erro do provedor — segue pro próximo da cadeia
					this.chainIdx++;
					this.nextProviderPage = 1;
					continue;
				}
				const advanceProvider = !page.hasMore || page.results.length === 0;
				this.nextProviderPage++;
				if (advanceProvider) {
					this.chainIdx++;
					this.nextProviderPage = 1;
				}
				if (page.results.length) {
					this.pages.push({ provider: provider.id, providerLabel: provider.label, results: page.results });
					this.pageIndex = this.pages.length - 1;
					return;
				}
			}
			this.exhausted = true;
		} finally {
			this.loading = false;
		}
	}
}
