// O SDK do PocketBase guarda a sessão em localStorage e é client-only;
// desativar SSR simplifica o auth guard (sem hidratação/estado divergente).
export const ssr = false;
export const prerender = false;
