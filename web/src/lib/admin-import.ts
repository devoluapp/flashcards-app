// Estado em memória de cada card do lote da tela /admin/import — pareia o card
// já criado no PocketBase com as colunas de imagem do CSV e com a sessão de
// busca/geração. Vive só na página (um refresh perde o pareamento; os cards de
// texto em si já estão salvos).
import type { CardRecord } from '$lib/types';
import type { ImageResult } from '$lib/image-search/types';
import type { ImageSearchSession } from '$lib/image-search/session.svelte';

export interface AdminCardState {
	record: CardRecord;
	imageSearch: string;
	imagePrompt: string;
	session: ImageSearchSession | null;
	generated: { blob: Blob; url: string } | null;
	selected: { kind: 'search'; result: ImageResult } | { kind: 'generated' } | null;
	saving: boolean;
	saved: boolean;
	generating: boolean;
}
