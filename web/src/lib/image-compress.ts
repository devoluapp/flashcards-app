// Compressão de imagem no navegador para WebP dentro de um limite de bytes.
// Usado pelo ImageCropUploader (fluxo com recorte manual) e pela tela admin de
// importação (fluxo automático, sem crop). Os limites devem bater com o maxSize
// do campo file equivalente no PocketBase (pb_migrations).

export const QUALITY_STEPS = [0.8, 0.6, 0.4, 0.25];

export class ImageTooLargeError extends Error {
	constructor(public finalSize: number) {
		super('Imagem excede o limite mesmo na menor qualidade');
	}
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/webp', quality)
	);
}

/** Converte o canvas para WebP tentando qualidades decrescentes até caber em maxBytes. */
export async function canvasToWebpUnderLimit(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
	let blob = await canvasToBlob(canvas, QUALITY_STEPS[0]);
	for (let i = 1; i < QUALITY_STEPS.length && blob.size > maxBytes; i++) {
		blob = await canvasToBlob(canvas, QUALITY_STEPS[i]);
	}
	if (blob.size > maxBytes) throw new ImageTooLargeError(blob.size);
	return blob;
}

/** Redimensiona (fit, preserva proporção, nunca amplia) e comprime um blob de imagem para WebP. */
export async function blobToWebpResized(
	src: Blob,
	{ maxSide = 1024, maxBytes = 2 * 1024 * 1024 }: { maxSide?: number; maxBytes?: number } = {}
): Promise<Blob> {
	const bitmap = await createImageBitmap(src);
	try {
		const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		return await canvasToWebpUnderLimit(canvas, maxBytes);
	} finally {
		bitmap.close();
	}
}
