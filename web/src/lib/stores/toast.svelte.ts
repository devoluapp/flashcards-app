export type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string };

let nextId = 1;
export const toasts = $state<Toast[]>([]);

export function pushToast(message: string, kind: Toast['kind'] = 'info', timeoutMs = 4000) {
	const id = nextId++;
	toasts.push({ id, kind, message });
	setTimeout(() => {
		const i = toasts.findIndex((t) => t.id === id);
		if (i !== -1) toasts.splice(i, 1);
	}, timeoutMs);
}

// Erro de auto-cancelamento do PocketBase (uma requisição mais nova com a mesma
// "request key" supersedeu essa) — não é um erro de verdade, quem vai atualizar a
// UI é a requisição nova. Ver https://github.com/pocketbase/js-sdk#auto-cancellation.
export function isAbortError(err: unknown): boolean {
	return !!err && typeof err === 'object' && (err as { isAbort?: boolean }).isAbort === true;
}

export function errorMessage(err: unknown): string {
	if (err && typeof err === 'object') {
		const anyErr = err as { response?: { message?: string; data?: Record<string, { message?: string }> }; message?: string };
		const data = anyErr.response?.data;
		if (data && Object.keys(data).length) {
			return Object.entries(data)
				.map(([field, e]) => `${field}: ${e?.message ?? 'inválido'}`)
				.join(' · ');
		}
		if (anyErr.response?.message) return anyErr.response.message;
		if (anyErr.message) return anyErr.message;
	}
	return 'Algo deu errado. Tente novamente.';
}
