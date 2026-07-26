/// <reference path="../pb_data/types.d.ts" />
// Cards digitalizados por foto podem não ter texto: front/back deixam de ser
// required no schema. A regra de conteúdo passa a ser "cada lado precisa de
// texto OU imagem", garantida pelo hook 7 em pb_hooks/main.pb.js (o required
// do schema não consegue expressar esse "ou" entre dois campos).
migrate((app) => {
  const cards = app.findCollectionByNameOrId("cards");
  cards.fields.getByName("front").required = false;
  cards.fields.getByName("back").required = false;
  app.save(cards);
}, (app) => {
  const cards = app.findCollectionByNameOrId("cards");
  cards.fields.getByName("front").required = true;
  cards.fields.getByName("back").required = true;
  app.save(cards);
});
