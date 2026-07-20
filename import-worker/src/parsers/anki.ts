import JSZip from "jszip";
import initSqlJs from "sql.js";
import type { ParsedCard } from "./csv.js";

// Anki .apkg = ZIP { collection.anki2 | collection.anki21 (SQLite), media (JSON), <n> arquivos de mídia }
// MVP: suportar anki2/anki21. Detectar collection.anki21b (zstd+protobuf) e avisar (fase 2 com fzstd).
//
// Campos de uma "note" ficam em notes.flds concatenados pelo separador 0x1F (unit separator).
// Regra de mapeamento simples: 1º campo = front, 2º campo = back (fallback robusto).

const FIELD_SEP = "\x1f"; // unit separator (0x1F) usado pelo Anki entre campos

export async function parseAnki(buf: ArrayBuffer, _options?: Record<string, unknown>): Promise<ParsedCard[]> {
  const zip = await JSZip.loadAsync(buf);

  if (zip.file("collection.anki21b")) {
    throw new Error(
      "Este .apkg usa o formato novo (anki21b, comprimido). Reexporte marcando " +
      "'Support older Anki versions' no Anki. (Suporte a zstd/protobuf: fase 2.)"
    );
  }

  const dbFile = zip.file("collection.anki21") ?? zip.file("collection.anki2");
  if (!dbFile) throw new Error("collection.anki2/anki21 não encontrado no .apkg");

  const SQL = await initSqlJs({});
  const db = new SQL.Database(new Uint8Array(await dbFile.async("uint8array")));

  // mapa de mídia: { "0": "imagem.png", ... }
  const mediaJson = zip.file("media");
  const mediaMap: Record<string, string> = mediaJson ? JSON.parse(await mediaJson.async("string")) : {};
  const nameToNum: Record<string, string> = {};
  for (const [num, name] of Object.entries(mediaMap)) nameToNum[name] = num;

  const res = db.exec("SELECT flds FROM notes");
  const cards: ParsedCard[] = [];
  if (res.length) {
    for (const row of res[0].values) {
      const flds = String(row[0]);
      const parts = flds.split(FIELD_SEP);
      const front = (parts[0] ?? "").trim();
      const back = (parts[1] ?? parts[0] ?? "").trim();
      if (!front) continue;

      // TODO fase 2: extrair <img src="x.png">, buscar em nameToNum, ler zip.file(num),
      // anexar como frontImage/backImage e reescrever o src para o arquivo do PocketBase.
      cards.push({ front, back });
    }
  }
  db.close();
  return cards;
}
