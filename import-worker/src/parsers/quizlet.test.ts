import { describe, it, expect } from "vitest";
import { parseQuizlet } from "./quizlet.js";

function buf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe("parseQuizlet", () => {
  it("parseia com delimitadores padrão (TAB entre termo/definição, \\n entre cards)", async () => {
    const cards = await parseQuizlet(buf("Termo1\tDefinição1\nTermo2\tDefinição2"));
    expect(cards).toEqual([
      { front: "Termo1", back: "Definição1" },
      { front: "Termo2", back: "Definição2" },
    ]);
  });

  it("respeita termSep/cardSep customizados", async () => {
    const cards = await parseQuizlet(buf("Termo1 - Def1 | Termo2 - Def2"), {
      termSep: " - ",
      cardSep: " | ",
    });
    expect(cards).toEqual([
      { front: "Termo1", back: "Def1" },
      { front: "Termo2", back: "Def2" },
    ]);
  });

  it("ignora linhas em branco e linhas sem separador", async () => {
    const cards = await parseQuizlet(buf("Termo1\tDef1\n\nlinha sem separador\nTermo2\tDef2\n"));
    expect(cards).toEqual([
      { front: "Termo1", back: "Def1" },
      { front: "Termo2", back: "Def2" },
    ]);
  });

  it("retorna lista vazia para texto vazio", async () => {
    const cards = await parseQuizlet(buf(""));
    expect(cards).toEqual([]);
  });
});
