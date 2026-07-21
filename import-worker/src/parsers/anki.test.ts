import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import initSqlJs from "sql.js";
import { parseAnki } from "./anki.js";

const FIELD_SEP = "\x1f";

// Monta um .apkg mínimo (zip com collection.anki21 + media) equivalente ao que o Anki exporta,
// só com o que o parser realmente lê (tabela "notes", coluna "flds").
async function buildApkg(notes: string[][], opts?: { dbFileName?: string; media?: Record<string, string> }) {
  const SQL = await initSqlJs({});
  const db = new SQL.Database();
  db.run("CREATE TABLE notes (id INTEGER PRIMARY KEY, flds TEXT)");
  for (const fields of notes) {
    db.run("INSERT INTO notes (flds) VALUES (?)", [fields.join(FIELD_SEP)]);
  }
  const dbBytes = db.export();
  db.close();

  const zip = new JSZip();
  zip.file(opts?.dbFileName ?? "collection.anki21", dbBytes);
  zip.file("media", JSON.stringify(opts?.media ?? {}));
  return await zip.generateAsync({ type: "arraybuffer" });
}

// Monta um .apkg completo, com `col.models` + `notes.mid`, igual ao que o Anki de fato exporta —
// necessário pra exercitar o mapeamento de campos via template (qfmt/afmt) em vez do fallback
// posicional simples.
async function buildApkgWithModel(
  model: { mid: number; name: string; flds: string[]; qfmt: string; afmt: string; type?: number },
  notes: string[][]
) {
  const SQL = await initSqlJs({});
  const db = new SQL.Database();
  db.run("CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT)");
  db.run("CREATE TABLE col (id INTEGER PRIMARY KEY, models TEXT)");

  const modelsJson = {
    [String(model.mid)]: {
      name: model.name,
      type: model.type ?? 0,
      flds: model.flds.map((name) => ({ name })),
      tmpls: [{ name: "Card 1", qfmt: model.qfmt, afmt: model.afmt }],
    },
  };
  db.run("INSERT INTO col (id, models) VALUES (1, ?)", [JSON.stringify(modelsJson)]);

  for (const fields of notes) {
    db.run("INSERT INTO notes (mid, flds) VALUES (?, ?)", [model.mid, fields.join(FIELD_SEP)]);
  }
  const dbBytes = db.export();
  db.close();

  const zip = new JSZip();
  zip.file("collection.anki21", dbBytes);
  zip.file("media", "{}");
  return await zip.generateAsync({ type: "arraybuffer" });
}

describe("parseAnki", () => {
  it("extrai front/back do 1º e 2º campo separados por 0x1F", async () => {
    const apkg = await buildApkg([
      ["Capital do Brasil", "Brasília"],
      ["Capital da França", "Paris"],
    ]);
    const cards = await parseAnki(apkg);
    expect(cards).toEqual([
      { front: "Capital do Brasil", back: "Brasília" },
      { front: "Capital da França", back: "Paris" },
    ]);
  });

  it("usa o 1º campo como back quando a nota só tem um campo", async () => {
    const apkg = await buildApkg([["Só um campo"]]);
    const cards = await parseAnki(apkg);
    expect(cards).toEqual([{ front: "Só um campo", back: "Só um campo" }]);
  });

  it("descarta notas sem front", async () => {
    const apkg = await buildApkg([["", "back sem front"], ["Q", "A"]]);
    const cards = await parseAnki(apkg);
    expect(cards).toEqual([{ front: "Q", back: "A" }]);
  });

  it("aceita collection.anki2 (formato antigo) como fallback", async () => {
    const apkg = await buildApkg([["Q", "A"]], { dbFileName: "collection.anki2" });
    const cards = await parseAnki(apkg);
    expect(cards).toEqual([{ front: "Q", back: "A" }]);
  });

  it("rejeita o formato novo anki21b com mensagem amigável", async () => {
    const zip = new JSZip();
    zip.file("collection.anki21b", new Uint8Array([0]));
    const apkg = await zip.generateAsync({ type: "arraybuffer" });
    await expect(parseAnki(apkg)).rejects.toThrow(/anki21b/);
  });

  it("rejeita .apkg sem collection.anki2/anki21", async () => {
    const zip = new JSZip();
    zip.file("media", "{}");
    const apkg = await zip.generateAsync({ type: "arraybuffer" });
    await expect(parseAnki(apkg)).rejects.toThrow(/collection\.anki2\/anki21/);
  });

  it("usa os templates do modelo (qfmt/afmt) em vez do campo[0]/campo[1] quando a nota type tem campos extras", async () => {
    // Reproduz o caso real reportado: note type com metadados (Id/Prova/Disciplina/Assunto) ANTES
    // dos campos de pergunta/resposta — pegar campo[0]/campo[1] cegamente mostra o código interno
    // na frente e a banca/concurso no verso, em vez da pergunta/resposta de fato.
    const apkg = await buildApkgWithModel(
      {
        mid: 900000,
        name: "Estude Com Anki",
        flds: ["Id", "Prova", "Disciplina", "Enunciado", "Resposta"],
        qfmt: "<div>{{Prova}} » {{Disciplina}}</div><div>{{Enunciado}}</div>",
        afmt: "{{FrontSide}}<hr><div>{{Resposta}}</div>",
      },
      [["575778QECA23", "Cebraspe - 2025 - SEFAZ-RJ", "Direito Tributário", "Qual a capital do Brasil?", "Brasília"]]
    );
    const cards = await parseAnki(apkg);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toContain("Cebraspe - 2025 - SEFAZ-RJ » Direito Tributário");
    expect(cards[0].front).toContain("Qual a capital do Brasil?");
    expect(cards[0].front).not.toContain("575778QECA23");
    expect(cards[0].back).toContain("Brasília");
    // {{FrontSide}} no afmt deve trazer o conteúdo já renderizado da frente.
    expect(cards[0].back).toContain("Qual a capital do Brasil?");
  });

  it("respeita condicionais {{#Campo}}/{{^Campo}} do template (mostra só se o campo correspondente estiver preenchido)", async () => {
    const apkg = await buildApkgWithModel(
      {
        mid: 900001,
        name: "Com campo opcional",
        flds: ["Pergunta", "Dica", "Resposta"],
        qfmt: "{{Pergunta}}{{#Dica}}<i>dica: {{Dica}}</i>{{/Dica}}",
        afmt: "{{Resposta}}",
      },
      [
        ["Com dica", "use isso", "resp1"],
        ["Sem dica", "", "resp2"],
      ]
    );
    const cards = await parseAnki(apkg);
    expect(cards[0].front).toContain("dica: use isso");
    expect(cards[1].front).not.toContain("dica:");
  });

  it("mascara/revela cloze deletions em note types Cloze", async () => {
    const apkg = await buildApkgWithModel(
      {
        mid: 900002,
        name: "Cloze",
        flds: ["Text", "Extra"],
        qfmt: "{{cloze:Text}}",
        afmt: "{{cloze:Text}}<br>{{Extra}}",
        type: 1,
      },
      [["A capital do Brasil é {{c1::Brasília}}.", "info extra"]]
    );
    const cards = await parseAnki(apkg);
    expect(cards[0].front).toContain("[...]");
    expect(cards[0].front).not.toContain("Brasília");
    expect(cards[0].back).toContain("Brasília");
    expect(cards[0].back).toContain("info extra");
  });

  it("remove <script>/handlers inline do template renderizado (proteção contra .apkg de origem não confiável)", async () => {
    // Simula um note type de terceiros com JS embutido no template, como o de alguns decks
    // vendidos comercialmente — front/back viram HTML renderizado com {@html} no app, então
    // rodar esse JS na sessão do usuário seria um XSS.
    const apkg = await buildApkgWithModel(
      {
        mid: 900003,
        name: "Com script",
        flds: ["Pergunta", "Resposta"],
        qfmt: '<div onclick="roubaSessao()">{{Pergunta}}</div><script>roubaSessao()</script>',
        afmt: "{{Resposta}}",
      },
      [["Pergunta normal", "Resposta normal"]]
    );
    const cards = await parseAnki(apkg);
    expect(cards[0].front).toContain("Pergunta normal");
    expect(cards[0].front).not.toContain("<script>");
    expect(cards[0].front).not.toContain("roubaSessao");
    expect(cards[0].front).not.toContain("onclick");
  });

  it("cai no fallback campo[0]/campo[1] quando a nota não tem mid reconhecível no col.models", async () => {
    // Mantém compatibilidade com .apkg sem metadata de modelo (ou mid não encontrado em col.models).
    const apkg = await buildApkg([["Capital do Brasil", "Brasília"]]);
    const cards = await parseAnki(apkg);
    expect(cards).toEqual([{ front: "Capital do Brasil", back: "Brasília" }]);
  });
});
