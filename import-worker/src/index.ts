import { pb, authAdmin, downloadJobFile, ensureDeck, type ImportJob } from "./pb.js";
import { parseCsv } from "./parsers/csv.js";
import { parseQuizlet } from "./parsers/quizlet.js";
import { parseAnki } from "./parsers/anki.js";

// Worker que processa import_jobs. Estratégia: realtime (SSE) + varredura inicial de pendentes.
// Todo parsing pesado roda AQUI (nunca dentro do PocketBase).

async function processJob(job: ImportJob) {
  try {
    await pb.collection("import_jobs").update(job.id, { status: "processing" });

    const buf = await downloadJobFile(job);
    const deckId = await ensureDeck(job, `Importado (${job.type})`);

    // Cada parser devolve uma lista de cards { front, back, tags, frontImage?, backImage? }
    let cards;
    if (job.type === "csv") cards = await parseCsv(buf, job.options);
    else if (job.type === "quizlet") cards = await parseQuizlet(buf, job.options);
    else cards = await parseAnki(buf, job.options); // anki .apkg

    let created = 0;
    for (const c of cards) {
      const form = new FormData();
      form.append("user", job.user);
      form.append("deck", deckId);
      form.append("front", c.front);
      form.append("back", c.back);
      form.append("state", "new");
      if (c.tags?.length) form.append("tags", JSON.stringify(c.tags));
      form.append("source", `job:${job.id}`);
      if (c.frontImage) form.append("front_image", new Blob([c.frontImage.data]), c.frontImage.name);
      if (c.backImage)  form.append("back_image",  new Blob([c.backImage.data]),  c.backImage.name);
      await pb.collection("cards").create(form);
      created++;
    }

    await pb.collection("import_jobs").update(job.id, {
      status: "done",
      result: { created, total: cards.length },
    });
    console.log(`job ${job.id}: ${created} cards criados`);
  } catch (err: any) {
    console.error(`job ${job.id} falhou:`, err?.message ?? err);
    await pb.collection("import_jobs").update(job.id, {
      status: "error",
      result: { error: String(err?.message ?? err) },
    });
  }
}

async function authAdminWithRetry() {
  let attempt = 0;
  for (;;) {
    try {
      await authAdmin();
      return;
    } catch (err: any) {
      attempt++;
      const delayMs = Math.min(30_000, attempt * 2_000);
      console.error(
        `falha ao autenticar no pocketbase (tentativa ${attempt}, nova tentativa em ${delayMs}ms):`,
        err?.message ?? err,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  await authAdminWithRetry();
  console.log("import-worker autenticado. Observando import_jobs...");

  // 1) processa o que já está pendente
  const pending = await pb.collection("import_jobs").getFullList({ filter: 'status = "pending"' });
  for (const j of pending) await processJob(j as unknown as ImportJob);

  // 2) escuta novos jobs em tempo real
  await pb.collection("import_jobs").subscribe("*", (e) => {
    if (e.action === "create" && e.record.status === "pending") {
      processJob(e.record as unknown as ImportJob);
    }
  });
}

main().catch((e) => {
  console.error("worker fatal:", e);
  process.exit(1);
});
