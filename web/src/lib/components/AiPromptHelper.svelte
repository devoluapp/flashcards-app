<script lang="ts">
	// Seção "crie flashcards com IA": usuário sobe o próprio material numa IA com
	// upload de arquivo (NotebookLM é o mais indicado — responde só com base no que
	// foi anexado, então erra menos), cola este prompt, e recebe de volta um bloco
	// CSV já no formato que a importação desta tela espera (front,back,tags).
	let {
		compact = false,
		context = 'import'
	}: { compact?: boolean; context?: 'import' | 'card' } = $props();

	let expanded = $state(!compact);
	let copied = $state(false);

	const PROMPT = `Você é um assistente que transforma material de estudo em flashcards no formato CSV, prontos para importar num app de repetição espaçada (tipo Anki).

MATERIAL: use o(s) arquivo(s) que anexei nesta conversa como única fonte de verdade — não invente nada que não esteja no material.

TAREFA: gere [QUANTIDADE] flashcards sobre [TEMA OU ASSUNTO], cobrindo os pontos mais importantes do material.

REGRAS DO FORMATO DE SAÍDA (siga à risca):
- Gere um bloco de texto CSV (separado por vírgula) com o cabeçalho exatamente: front,back,tags
- Uma linha por card.
- "front" = a pergunta, termo ou conceito. "back" = a resposta, direta e completa.
- Cada card deve cobrir UM ÚNICO fato ou conceito (evite perguntas compostas).
- Se o texto tiver vírgula, coloque o campo inteiro entre aspas duplas.
- Não use Markdown, HTML, negrito ou itálico — apenas texto simples.
- "tags" é opcional; se usar mais de uma, separe por ponto e vírgula (ex.: "direito;tributário").
- Não escreva nada antes ou depois do bloco CSV — sem explicações, sem marcação de código.

EXEMPLO do formato esperado:
front,back,tags
"Qual é a capital da França?","Paris",geografia
"O que é obrigação tributária?","É o vínculo jurídico que obriga o contribuinte a pagar tributo ou cumprir dever acessório ao Fisco","direito;tributário"`;

	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(PROMPT);
		} catch {
			// fallback pra contextos sem Clipboard API disponível
			const ta = document.createElement('textarea');
			ta.value = PROMPT;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		}
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white dark:border-brand-800/60 dark:from-brand-900/25 dark:to-neutral-900">
	<button type="button" onclick={() => (expanded = !expanded)} class="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
		<span class="flex items-center gap-2.5">
			<span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
				<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
				</svg>
			</span>
			<span>
				<span class="block text-sm font-bold text-neutral-900 dark:text-neutral-50">Crie flashcards com ajuda de uma IA</span>
				<span class="block text-xs text-neutral-500">Transforme seu material de estudo em cards prontos pra importar</span>
			</span>
		</span>
		<svg
			viewBox="0 0 24 24"
			class="h-5 w-5 shrink-0 text-neutral-400 transition-transform {expanded ? 'rotate-180' : ''}"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	</button>

	{#if expanded}
		<div class="space-y-3 border-t border-brand-100 px-5 pb-5 pt-4 dark:border-brand-900/40">
			<p class="text-sm text-neutral-600 dark:text-neutral-300">
				Suba <strong>seu próprio material</strong> (PDF, slides, anotações — algo que você já sabe que é bom) numa IA
				que aceite anexar arquivos. Recomendamos o <strong>NotebookLM</strong> (Google) — ele responde só com base no
				que você subiu, então erra menos. ChatGPT, Claude e Gemini também funcionam. Depois é só colar o prompt
				abaixo, ajustar o que estiver entre colchetes e enviar.
			</p>

			<pre
				class="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-neutral-200 bg-white p-3.5 font-mono text-xs leading-relaxed text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">{PROMPT}</pre>

			<button
				type="button"
				onclick={copyPrompt}
				class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700"
			>
				{#if copied}
					<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7" /></svg>
					Copiado!
				{:else}
					<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"
						><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg
					>
					Copiar prompt
				{/if}
			</button>

			<p class="text-xs text-neutral-500">
				{#if context === 'import'}
					A IA vai devolver um bloco de texto CSV — cole no campo abaixo (ou salve como arquivo .csv e envie).
				{:else}
					A IA vai devolver várias linhas no formato <code class="font-mono">front,back,tags</code>. Pra um card só,
					copie uma linha e cole a pergunta em "Frente" e a resposta em "Verso". Pra criar vários de uma vez, use a
					tela de <strong>Importar</strong>.
				{/if}
			</p>
		</div>
	{/if}
</div>
