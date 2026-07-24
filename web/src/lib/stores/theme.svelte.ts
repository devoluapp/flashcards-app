import { pb, currentUser } from '$lib/pb';

// Lista duplicada em web/src/app.html (script anti-flash, roda antes do bundle
// carregar) — mantenha as duas em sincronia se adicionar/remover um tema.
export const THEMES = [
	{ id: 'oceano', label: 'Oceano', swatch: '#2563eb' },
	{ id: 'turquesa', label: 'Turquesa', swatch: '#0b7889' },
	{ id: 'ametista', label: 'Ametista', swatch: '#7b4ee6' },
	{ id: 'rosa', label: 'Rosa', swatch: '#d31765' },
	{ id: 'grafite', label: 'Grafite', swatch: '#616d8b' }
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'flashcards:theme';
const DEFAULT_THEME: ThemeId = 'oceano';

function isValidTheme(v: unknown): v is ThemeId {
	return typeof v === 'string' && THEMES.some((t) => t.id === v);
}

// Tema é uma preferência client-side (cor da UI, não dado do usuário), então localStorage
// resolve sozinho no mesmo dispositivo; sincroniza também em users.settings.theme só pra
// não precisar escolher de novo ao trocar de aparelho — falha de rede aqui não é crítica.
class ThemeStore {
	current = $state<ThemeId>(DEFAULT_THEME);

	constructor() {
		if (typeof localStorage !== 'undefined') {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (isValidTheme(saved)) this.current = saved;
		}
		this.applyToDocument();

		pb.authStore.onChange(() => {
			const remote = currentUser()?.settings?.theme;
			if (isValidTheme(remote) && remote !== this.current) this.set(remote, { persistRemote: false });
		}, true);
	}

	private applyToDocument() {
		if (typeof document === 'undefined') return;
		document.documentElement.setAttribute('data-theme', this.current);
		const meta = document.querySelector('meta[name="theme-color"]');
		const swatch = THEMES.find((t) => t.id === this.current)?.swatch;
		if (meta && swatch) meta.setAttribute('content', swatch);
	}

	async set(id: ThemeId, opts: { persistRemote?: boolean } = {}) {
		this.current = id;
		this.applyToDocument();
		if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, id);

		if (opts.persistRemote === false) return;
		const user = currentUser();
		if (!pb.authStore.isValid || !user) return;
		try {
			await pb.collection('users').update(user.id, {
				settings: { ...(user.settings ?? {}), theme: id }
			});
		} catch {
			// tema já aplicado localmente; só não sincronizou pros outros dispositivos
		}
	}
}

export const theme = new ThemeStore();
