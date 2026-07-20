import Papa from "papaparse";

export type ParsedCard = {
  front: string;
  back: string;
  tags?: string[];
  frontImage?: { name: string; data: Uint8Array<ArrayBuffer> };
  backImage?: { name: string; data: Uint8Array<ArrayBuffer> };
};

type CsvOptions = {
  frontCol?: string;   // nome/índice da coluna de frente (default: 0 / "front")
  backCol?: string;    // (default: 1 / "back")
  tagsCol?: string;    // separadas por ";"
  hasHeader?: boolean; // default true
};

// CSV → cards. Imagens por CSV ficam para a fase 2 (referência a arquivo dentro de um zip).
export async function parseCsv(buf: ArrayBuffer, options?: Record<string, unknown>): Promise<ParsedCard[]> {
  const opt = (options ?? {}) as CsvOptions;
  const text = new TextDecoder("utf-8").decode(buf);
  const parsed = Papa.parse<string[] | Record<string, string>>(text, {
    header: opt.hasHeader !== false,
    skipEmptyLines: true,
  });

  const front = opt.frontCol ?? "front";
  const back = opt.backCol ?? "back";
  const tags = opt.tagsCol ?? "tags";

  const rows = parsed.data as any[];
  return rows
    .map((r) => {
      const f = Array.isArray(r) ? r[Number(front) || 0] : r[front];
      const b = Array.isArray(r) ? r[Number(back) || 1] : r[back];
      const t = Array.isArray(r) ? r[Number(tags)] : r[tags];
      if (!f || !b) return null;
      return {
        front: String(f).trim(),
        back: String(b).trim(),
        tags: t ? String(t).split(";").map((s) => s.trim()).filter(Boolean) : undefined,
      } as ParsedCard;
    })
    .filter(Boolean) as ParsedCard[];
}
