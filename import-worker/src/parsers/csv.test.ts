import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv.js";

function buf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe("parseCsv", () => {
  it("parseia colunas 'front'/'back' por header (default)", async () => {
    const cards = await parseCsv(buf("front,back\nCapital do Brasil,Brasília\nCapital da França,Paris\n"));
    expect(cards).toEqual([
      { front: "Capital do Brasil", back: "Brasília", tags: undefined },
      { front: "Capital da França", back: "Paris", tags: undefined },
    ]);
  });

  it("respeita frontCol/backCol/tagsCol customizados", async () => {
    const cards = await parseCsv(
      buf("pergunta,resposta,marcadores\nQ1,A1,geo;capital\n"),
      { frontCol: "pergunta", backCol: "resposta", tagsCol: "marcadores" },
    );
    expect(cards).toEqual([{ front: "Q1", back: "A1", tags: ["geo", "capital"] }]);
  });

  it("funciona sem header usando índices posicionais", async () => {
    const cards = await parseCsv(buf("Q1,A1\nQ2,A2\n"), { hasHeader: false });
    expect(cards).toEqual([
      { front: "Q1", back: "A1", tags: undefined },
      { front: "Q2", back: "A2", tags: undefined },
    ]);
  });

  it("descarta linhas sem front ou back", async () => {
    const cards = await parseCsv(buf("front,back\nSó front,\n,Só back\nOK,OK\n"));
    expect(cards).toEqual([{ front: "OK", back: "OK", tags: undefined }]);
  });

  it("retorna lista vazia para CSV vazio", async () => {
    const cards = await parseCsv(buf("front,back\n"));
    expect(cards).toEqual([]);
  });
});
