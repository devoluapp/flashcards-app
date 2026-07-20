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
});
