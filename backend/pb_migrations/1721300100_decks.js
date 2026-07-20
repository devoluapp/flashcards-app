/// <reference path="../pb_data/types.d.ts" />
// Coleção "decks" — privado por usuário, com soft delete e subdecks (self-relation).
migrate((app) => {
  const usersId = app.findCollectionByNameOrId("users").id;
  const rule = "@request.auth.id != '' && user = @request.auth.id";
  // A createRule roda em "dry submit" ANTES do hook forceOwner (pb_hooks/main.pb.js)
  // preencher "user" — nesse momento o campo ainda está vazio, então a regra de criação
  // só pode exigir autenticação; forceOwner garante o dono correto no save real.
  const createRule = "@request.auth.id != ''";

  const decks = new Collection({
    type: "base",
    name: "decks",
    listRule: rule, viewRule: rule, createRule: createRule, updateRule: rule, deleteRule: rule,
    fields: [
      { name: "user", type: "relation", required: true, collectionId: usersId, cascadeDelete: true, maxSelect: 1 },
      { name: "name", type: "text", required: true, max: 200 },
      { name: "description", type: "text" },
      { name: "color", type: "text" },
      { name: "is_public", type: "bool" },
      { name: "deleted", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_decks_user ON decks (user)",
      "CREATE INDEX idx_decks_updated ON decks (updated)",
    ],
  });
  app.save(decks);

  // self-relation: 'parent' só pode apontar para "decks" depois que a coleção existe
  // (a v0.23+ rejeita collectionId vazio na criação, então o campo entra num segundo save)
  decks.fields.add(new RelationField({
    name: "parent", collectionId: decks.id, cascadeDelete: false, maxSelect: 1,
  }));
  app.save(decks);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("decks"));
});
