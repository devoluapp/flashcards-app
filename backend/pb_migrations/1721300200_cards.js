/// <reference path="../pb_data/types.d.ts" />
// Coleção "cards" — conteúdo + imagens + estado de memória FSRS.
migrate((app) => {
  const usersId = app.findCollectionByNameOrId("users").id;
  const decksId = app.findCollectionByNameOrId("decks").id;
  const rule = "@request.auth.id != '' && user = @request.auth.id";
  // ver comentário equivalente em 1721300100_decks.js sobre createRule x forceOwner
  const createRule = "@request.auth.id != ''";

  const cards = new Collection({
    type: "base",
    name: "cards",
    listRule: rule, viewRule: rule, createRule: createRule, updateRule: rule, deleteRule: rule,
    fields: [
      { name: "user", type: "relation", required: true, collectionId: usersId, cascadeDelete: true, maxSelect: 1 },
      { name: "deck", type: "relation", required: true, collectionId: decksId, cascadeDelete: true, maxSelect: 1 },
      { name: "front", type: "editor", required: true },
      { name: "back",  type: "editor", required: true },
      { name: "front_image", type: "file", maxSelect: 1, maxSize: 2097152,
        mimeTypes: ["image/jpeg","image/png","image/webp"], thumbs: ["100x100","400x300f","800x600f"] },
      { name: "back_image",  type: "file", maxSelect: 1, maxSize: 2097152,
        mimeTypes: ["image/jpeg","image/png","image/webp"], thumbs: ["100x100","400x300f","800x600f"] },
      { name: "media", type: "file", maxSelect: 6, maxSize: 2097152,
        mimeTypes: ["image/jpeg","image/png","image/webp"], thumbs: ["400x300f"] },
      { name: "tags", type: "json", maxSize: 20000 },

      // ---- estado FSRS ----
      { name: "state", type: "select", maxSelect: 1, values: ["new","learning","review","relearning"] },
      { name: "due", type: "date" },
      { name: "stability", type: "number" },
      { name: "difficulty", type: "number" },
      { name: "elapsed_days", type: "number" },
      { name: "scheduled_days", type: "number" },
      { name: "reps", type: "number", onlyInt: true },
      { name: "lapses", type: "number", onlyInt: true },
      { name: "last_review", type: "date" },
      { name: "suspended", type: "bool" },

      { name: "source", type: "text" },
      { name: "deleted", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_cards_user ON cards (user)",
      "CREATE INDEX idx_cards_deck ON cards (deck)",
      "CREATE INDEX idx_cards_due ON cards (due)",
      "CREATE INDEX idx_cards_updated ON cards (updated)",
    ],
  });
  app.save(cards);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("cards"));
});
