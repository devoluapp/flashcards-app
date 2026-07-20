import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// App 100% client-side (ssr=false, auth via localStorage) -> build estático em modo SPA,
			// servível por qualquer web server/CDN. Ver src/routes/+layout.ts.
			adapter: adapter({ fallback: 'index.html' })
		})
	]
});
