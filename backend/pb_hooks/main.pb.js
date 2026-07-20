/// <reference path="../pb_data/types.d.ts" />
// Hooks de validação/negócio. Sintaxe PocketBase v0.23+ (JSVM) — sua v0.39.7.
// Todos os handlers de *Request* devem chamar e.next() para prosseguir.

// 1) Preenche automaticamente o campo "user" com o dono autenticado (defesa + conveniência).
// Nota: "auth" vem de e.auth (propriedade), NÃO de e.requestInfo (que é um MÉTODO,
// e.requestInfo.auth portanto é sempre undefined e o hook nunca dispara).
// Importante: a createRule das coleções NÃO pode comparar "user = @request.auth.id",
// porque a checagem da regra roda em "dry submit" antes deste hook — nesse momento
// "user" ainda está vazio. As migrations usam createRule só com "@request.auth.id != ''"
// e é este hook quem garante (e não deixa spoofar) o dono de fato no save real.
// Superusuários (ex.: o import-worker autenticado em "_superusers") ficam de fora:
// o id de um superuser não existe na coleção "users", então sobrescrever quebraria
// a relação — nesse caso confia-se no "user" que o próprio worker já enviou.
function forceOwner(e) {
  const auth = e.auth;
  if (auth && !e.hasSuperuserAuth()) e.record.set("user", auth.id);
  e.next();
}
onRecordCreateRequest(forceOwner, "decks", "cards", "review_logs", "import_jobs");

// 2) Cota de armazenamento de imagens por plano (exemplo: free = 50 MB).
onRecordCreateRequest((e) => {
  const auth = e.auth;
  if (auth && auth.get("plan") === "free" && auth.getInt("storage_used") > 50 * 1024 * 1024) {
    throw new BadRequestError("Cota de imagens do plano free atingida. Faça upgrade para Pro.");
  }
  e.next();
}, "cards");

// 3) Limite de decks no plano free (exemplo: 3).
onRecordCreateRequest((e) => {
  const auth = e.auth;
  if (auth && auth.get("plan") === "free") {
    const count = $app.countRecords("decks", $dbx.exp("user = {:u}", { u: auth.id }));
    if (count >= 3) throw new BadRequestError("Plano free permite até 3 decks.");
  }
  e.next();
}, "decks");

// 4) (opcional) inicializa estado FSRS de um card novo, se vier vazio.
onRecordCreateRequest((e) => {
  if (!e.record.get("state")) {
    e.record.set("state", "new");
    e.record.set("reps", 0);
    e.record.set("lapses", 0);
    e.record.set("stability", 0);
    e.record.set("difficulty", 0);
  }
  e.next();
}, "cards");

// 5) import_jobs sempre nasce "pending" — o worker só varre/escuta esse status,
// e nada mais define esse default (ao contrário de "state" em cards, hook #4).
onRecordCreateRequest((e) => {
  if (!e.record.get("status")) e.record.set("status", "pending");
  e.next();
}, "import_jobs");
