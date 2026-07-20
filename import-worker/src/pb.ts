import PocketBase from "pocketbase";
import { EventSource } from "eventsource";

// O SDK do PocketBase usa EventSource (SSE) para realtime, mas o Node não tem
// esse global (é uma API de browser) — precisa do polyfill antes de qualquer subscribe().
if (!("EventSource" in globalThis)) {
  (globalThis as any).EventSource = EventSource;
}

const PB_URL = process.env.PB_URL ?? "http://pocketbase:8090";

export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

// Autentica como superusuário (v0.23+: coleção "_superusers", não mais "admins").
export async function authAdmin() {
  await pb
    .collection("_superusers")
    .authWithPassword(process.env.PB_ADMIN_EMAIL!, process.env.PB_ADMIN_PASSWORD!);
}

export type ImportJob = {
  id: string;
  user: string;
  type: "anki" | "quizlet" | "csv";
  file: string;
  target_deck?: string;
  options?: Record<string, unknown>;
  status: "pending" | "processing" | "done" | "error";
};

// Baixa o arquivo anexado ao job (com token para arquivos protegidos, se necessário).
export async function downloadJobFile(job: ImportJob): Promise<ArrayBuffer> {
  const rec = await pb.collection("import_jobs").getOne(job.id);
  const url = pb.files.getURL(rec, rec.file); // v0.23+: getURL (não getUrl)
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download falhou: ${res.status}`);
  return await res.arrayBuffer();
}

// Garante um deck de destino (usa target_deck ou cria um novo).
export async function ensureDeck(job: ImportJob, fallbackName: string): Promise<string> {
  if (job.target_deck) return job.target_deck;
  const deck = await pb.collection("decks").create({ user: job.user, name: fallbackName });
  return deck.id;
}
