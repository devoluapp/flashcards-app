/// <reference path="../pb_data/types.d.ts" />
// Coleção "import_jobs" — fila de importação processada pelo Import Worker.
migrate((app) => {
  const usersId = app.findCollectionByNameOrId("users").id;
  const decksId = app.findCollectionByNameOrId("decks").id;
  const owner = "@request.auth.id != '' && user = @request.auth.id";
  // ver comentário equivalente em 1721300100_decks.js sobre createRule x forceOwner
  const createRule = "@request.auth.id != ''";

  const jobs = new Collection({
    type: "base",
    name: "import_jobs",
    listRule: owner,
    viewRule: owner,
    createRule: createRule,
    updateRule: owner,   // o Worker atualiza autenticado como _superuser (ignora rules)
    deleteRule: owner,
    fields: [
      { name: "user", type: "relation", required: true, collectionId: usersId, cascadeDelete: true, maxSelect: 1 },
      { name: "type", type: "select", required: true, maxSelect: 1, values: ["anki","quizlet","csv"] },
      { name: "file", type: "file", maxSelect: 1, maxSize: 104857600 }, // 100 MB (arquivos .apkg podem ser grandes)
      { name: "target_deck", type: "relation", collectionId: decksId, cascadeDelete: false, maxSelect: 1 },
      { name: "options", type: "json", maxSize: 50000 },
      { name: "status", type: "select", maxSelect: 1, values: ["pending","processing","done","error"] },
      { name: "result", type: "json", maxSize: 200000 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_jobs_status ON import_jobs (status)",
      "CREATE INDEX idx_jobs_user ON import_jobs (user)",
    ],
  });
  app.save(jobs);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("import_jobs"));
});
