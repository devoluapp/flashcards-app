<script lang="ts">
	import { PUBLIC_APP_VERSION } from '$env/static/public';

	const version = PUBLIC_APP_VERSION || 'dev';
</script>

<footer class="py-4 text-center text-xs text-neutral-400 dark:text-neutral-600">
	Flashcards <span title="Versão da release">{version}</span>
</footer>
