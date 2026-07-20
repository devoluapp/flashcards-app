/// <reference path="../pb_data/types.d.ts" />
// Coleção "review_logs" — histórico append-only (imutável) usado pelo otimizador FSRS.
migrate((app) => {
  const usersId = app.findCollectionByNameOrId("users").id;
  const cardsId = app.findCollectionByNameOrId("cards").id;
  const owner = "@request.auth.id != '' && user = @request.auth.id";
  // ver comentário equivalente em 1721300100_decks.js sobre createRule x forceOwner
  const createRule = "@request.auth.id != ''";

  const logs = new Collection({
    type: "base",
    name: "review_logs",
    listRule: owner,
    viewRule: owner,
    createRule: createRule,
    updateRule: null,   // imutável
    deleteRule: null,   // imutável
    fields: [
      { name: "user", type: "relation", required: true, collectionId: usersId, cascadeDelete: true, maxSelect: 1 },
      { name: "card", type: "relation", required: true, collectionId: cardsId, cascadeDelete: true, maxSelect: 1 },
      { name: "rating", type: "number", required: true, onlyInt: true, min: 1, max: 4 },
      { name: "state", type: "select", maxSelect: 1, values: ["new","learning","review","relearning"] },
      { name: "due", type: "date" },
      { name: "stability", type: "number" },
      { name: "difficulty", type: "number" },
      { name: "elapsed_days", type: "number" },
      { name: "last_elapsed_days", type: "number" },
      { name: "scheduled_days", type: "number" },
      { name: "review", type: "date", required: true },
      { name: "duration_ms", type: "number", onlyInt: true },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: [
      "CREATE INDEX idx_logs_card ON review_logs (card)",
      "CREATE INDEX idx_logs_user_review ON review_logs (user, review)",
    ],
  });
  app.save(logs);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("review_logs"));
});
