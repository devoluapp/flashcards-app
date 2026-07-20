<script lang="ts">
	let { value = $bindable(''), placeholder = '' }: { value?: string; placeholder?: string } = $props();

	let el: HTMLDivElement | undefined = $state();
	let mounted = false;

	$effect(() => {
		if (el && !mounted) {
			el.innerHTML = value || '';
			mounted = true;
		}
	});

	function exec(cmd: string) {
		document.execCommand(cmd);
		el?.focus();
		sync();
	}

	function sync() {
		value = el?.innerHTML ?? '';
	}

	const buttons: { cmd: string; label: string }[] = [
		{ cmd: 'bold', label: 'B' },
		{ cmd: 'italic', label: 'I' },
		{ cmd: 'underline', label: 'U' },
		{ cmd: 'insertUnorderedList', label: '•' }
	];
</script>

<div class="overflow-hidden rounded-lg border border-neutral-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30 dark:border-neutral-700">
	<div class="flex gap-0.5 border-b border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-800 dark:bg-neutral-900/60">
		{#each buttons as b (b.cmd)}
			<button
				type="button"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => exec(b.cmd)}
				class="h-7 w-7 rounded text-sm font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-800"
				class:italic={b.cmd === 'italic'}
				class:underline={b.cmd === 'underline'}
			>
				{b.label}
			</button>
		{/each}
	</div>
	<div
		bind:this={el}
		contenteditable="true"
		role="textbox"
		aria-multiline="true"
		data-placeholder={placeholder}
		oninput={sync}
		class="rich-editor border-0 focus:ring-0"
	></div>
</div>
