/// <reference path="../pb_data/types.d.ts" />
// Metadados de imagem mnemônica do card, vindos do CSV da tela /admin/import:
// "image_search" (termos de busca em bancos de imagem) e "image_prompt" (prompt
// de geração por IA). Persistem junto do card, mas por enquanto só são exibidos/
// editados na tela admin — nenhuma outra tela os mostra. Acesso segue as rules
// normais de cards (dono + verified); não há nada privilegiado nesses campos.
migrate((app) => {
  const cards = app.findCollectionByNameOrId("cards");
  cards.fields.add(new TextField({ name: "image_search", max: 500 }));
  cards.fields.add(new TextField({ name: "image_prompt", max: 2000 }));
  app.save(cards);
}, (app) => {
  const cards = app.findCollectionByNameOrId("cards");
  ["image_search", "image_prompt"].forEach((n) => cards.fields.removeByName(n));
  app.save(cards);
});
