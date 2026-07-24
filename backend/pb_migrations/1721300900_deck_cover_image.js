/// <reference path="../pb_data/types.d.ts" />
// Adiciona imagem de capa opcional ao deck. Mesmos limites/thumbs usados em
// cards.front_image/back_image (1721300200_cards.js) para manter consistência.
migrate((app) => {
  const decks = app.findCollectionByNameOrId("decks");

  decks.fields.add(new FileField({
    name: "cover_image", maxSelect: 1, maxSize: 2097152,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    thumbs: ["400x225f", "800x450f"],
  }));

  app.save(decks);
}, (app) => {
  const decks = app.findCollectionByNameOrId("decks");
  decks.fields.removeByName("cover_image");
  app.save(decks);
});
