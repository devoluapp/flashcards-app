import JSZip from "jszip";
import initSqlJs from "sql.js";
import type { ParsedCard } from "./csv.js";

// Anki .apkg = ZIP { collection.anki2 | collection.anki21 (SQLite), media (JSON), <n> arquivos de mídia }
// MVP: suportar anki2/anki21. Detectar collection.anki21b (zstd+protobuf) e avisar (fase 2 com fzstd).
//
// Campos de uma "note" ficam em notes.flds concatenados pelo separador 0x1F (unit separator).
// O NOME de cada campo (e como front/back são montados a partir deles) vem do modelo da nota
// (col.models[mid].flds + .tmpls[].qfmt/afmt) — muitos note types (ex.: decks de bancas/concursos)
// têm campos extras de metadado (Id, Banca, Disciplina...) ANTES do campo de pergunta/resposta, então
// não dá pra assumir "1º campo = front, 2º = back". Só caímos nesse fallback simples quando a nota não
// tem mid reconhecível no `col.models` (ex.: .apkg minimalista/corrompido sem metadata de modelo).

const FIELD_SEP = "\x1f"; // unit separator (0x1F) usado pelo Anki entre campos

type AnkiTemplate = { name?: string; qfmt?: string; afmt?: string };
type AnkiModel = { name?: string; flds?: { name: string }[]; tmpls?: AnkiTemplate[]; type?: number };

// Placeholders tipo mustache do Anki: {{Campo}}, {{#Campo}}...{{/Campo}} (mostra se não-vazio),
// {{^Campo}}...{{/Campo}} (mostra se vazio), {{hint:Campo}}, {{type:Campo}} (ignorado, não interativo
// fora do Anki), {{FrontSide}} (conteúdo já renderizado da frente, usado no verso).
function renderTemplate(tmpl: string, fields: Record<string, string>, frontSideHtml?: string): string {
  let out = tmpl;
  if (frontSideHtml !== undefined) out = out.replace(/{{\s*FrontSide\s*}}/g, () => frontSideHtml);
  out = out.replace(/{{#([^}]+)}}([\s\S]*?){{\/\1}}/g, (_m, field, inner) => {
    const val = fields[String(field).trim()];
    return val && val.trim() ? inner : "";
  });
  out = out.replace(/{{\^([^}]+)}}([\s\S]*?){{\/\1}}/g, (_m, field, inner) => {
    const val = fields[String(field).trim()];
    return !val || !val.trim() ? inner : "";
  });
  out = out.replace(/{{hint:([^}]+)}}/g, (_m, field) => fields[String(field).trim()] ?? "");
  out = out.replace(/{{type:[^}]+}}/g, "");
  out = out.replace(/{{([^#^/{}]+)}}/g, (_m, field) => {
    field = String(field).trim();
    return field === "FrontSide" ? "" : (fields[field] ?? "");
  });
  return out;
}

// Note types "Cloze" usam {{cloze:Campo}} no template, com o texto do campo contendo
// {{c1::resposta}}, {{c2::resposta::dica}}, etc. Na frente mascaramos a lacuna, no verso revelamos.
function renderClozeField(text: string, reveal: boolean): string {
  return text.replace(/{{c\d+::(.*?)(?:::(.*?))?}}/g, (_m, answer, hint) =>
    reveal ? `<span class="cloze">${answer}</span>` : `<span class="cloze">[${hint || "..."}]</span>`
  );
}

function renderClozeTemplate(
  tmpl: string,
  fields: Record<string, string>,
  reveal: boolean,
  frontSideHtml?: string
): string {
  const withCloze = tmpl.replace(/{{cloze:([^}]+)}}/g, (_m, field) =>
    renderClozeField(fields[String(field).trim()] ?? "", reveal)
  );
  return renderTemplate(withCloze, fields, frontSideHtml);
}

// Templates de note type de terceiros podem trazer <script>/handlers inline (ex.: decks vendidos
// com JS de integração próprio). O front/back vira HTML renderizado com {@html} no app, então
// removemos o que puder executar em vez de só usar o campo cru — sem isso, importar um .apkg de
// origem não confiável rodaria JS arbitrário na sessão do usuário.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+\s*=\s*"(?:[^"])*"/gi, "")
    .replace(/\son\w+\s*=\s*'(?:[^'])*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
}

function legacyFrontBack(parts: string[]): { front: string; back: string } {
  const front = (parts[0] ?? "").trim();
  const back = (parts[1] ?? parts[0] ?? "").trim();
  return { front, back };
}

function readModels(db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>): Record<string, AnkiModel> {
  try {
    const res = db.exec("SELECT models FROM col");
    const json = res[0]?.values?.[0]?.[0];
    return json ? JSON.parse(String(json)) : {};
  } catch {
    return {};
  }
}

function readNotes(
  db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>
): { mid: number | null; flds: string }[] {
  try {
    const res = db.exec("SELECT mid, flds FROM notes");
    if (!res.length) return [];
    return res[0].values.map((row) => ({ mid: Number(row[0]), flds: String(row[1]) }));
  } catch {
    // Schema mínimo sem coluna `mid` (ex.: .apkg construído à mão sem metadata de modelo).
    const res = db.exec("SELECT flds FROM notes");
    if (!res.length) return [];
    return res[0].values.map((row) => ({ mid: null, flds: String(row[0]) }));
  }
}

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

  const models = readModels(db);
  const notes = readNotes(db);
  const cards: ParsedCard[] = [];

  for (const note of notes) {
    const parts = note.flds.split(FIELD_SEP);
    const model = note.mid != null ? models[String(note.mid)] : undefined;

    let front = "";
    let back = "";

    if (model?.tmpls?.length && model?.flds?.length && model.tmpls[0]?.qfmt && model.tmpls[0]?.afmt) {
      const fieldMap: Record<string, string> = {};
      model.flds.forEach((f, i) => {
        fieldMap[f.name] = (parts[i] ?? "").trim();
      });

      const tmpl = model.tmpls[0];
      const isCloze = model.type === 1;
      const rawFront = isCloze
        ? renderClozeTemplate(tmpl.qfmt!, fieldMap, false)
        : renderTemplate(tmpl.qfmt!, fieldMap);
      const rawBack = isCloze
        ? renderClozeTemplate(tmpl.afmt!, fieldMap, true, rawFront)
        : renderTemplate(tmpl.afmt!, fieldMap, rawFront);

      front = sanitizeHtml(rawFront).trim();
      back = sanitizeHtml(rawBack).trim();
    }

    if (!front) {
      const legacy = legacyFrontBack(parts);
      front = legacy.front;
      back = back || legacy.back;
    }
    if (!front) continue;

    // TODO fase 2: extrair <img src="x.png">, buscar em nameToNum, ler zip.file(num),
    // anexar como frontImage/backImage e reescrever o src para o arquivo do PocketBase.
    cards.push({ front, back });
  }
  db.close();
  return cards;
}
