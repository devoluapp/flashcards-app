import type { ParsedCard } from "./csv.js";

type QuizletOptions = {
  termSep?: string; // delimitador termo <-> definição (default: TAB)
  cardSep?: string; // delimitador entre cards (default: nova linha)
};

// Quizlet exporta como TEXTO delimitado (não há formato de arquivo oficial).
// O usuário cola/sobe o texto e define os delimitadores. Sem mídia.
export async function parseQuizlet(buf: ArrayBuffer, options?: Record<string, unknown>): Promise<ParsedCard[]> {
  const opt = (options ?? {}) as QuizletOptions;
  const termSep = opt.termSep ?? "\t";
  const cardSep = opt.cardSep ?? "\n";

  const text = new TextDecoder("utf-8").decode(buf);
  return text
    .split(cardSep)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(termSep);
      if (idx === -1) return null;
      const front = line.slice(0, idx).trim();
      const back = line.slice(idx + termSep.length).trim();
      if (!front || !back) return null;
      return { front, back } as ParsedCard;
    })
    .filter(Boolean) as ParsedCard[];
}
