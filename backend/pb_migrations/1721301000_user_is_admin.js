/// <reference path="../pb_data/types.d.ts" />
// Flag de administrador do app (tela /admin/import no front). Marcado manualmente
// via painel do PocketBase — nunca pelo próprio usuário (ver hook anti auto-promoção
// em pb_hooks/main.pb.js). Não confundir com superusers (_superusers): admin aqui é
// um usuário normal de "users", dono dos próprios decks/cards.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new BoolField({ name: "is_admin" }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("is_admin");
  app.save(users);
});
