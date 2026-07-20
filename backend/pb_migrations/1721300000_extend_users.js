/// <reference path="../pb_data/types.d.ts" />
// Estende a coleção auth "users" com campos do domínio (FSRS, plano, quota).
// Sintaxe PocketBase v0.23+ (JSVM) — compatível com a sua v0.39.7.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  users.fields.add(new NumberField({ name: "desired_retention", min: 0.7, max: 0.99 }));
  users.fields.add(new JSONField({   name: "fsrs_params", maxSize: 200000 }));
  users.fields.add(new TextField({   name: "timezone" }));
  users.fields.add(new SelectField({ name: "plan", maxSelect: 1, values: ["free", "pro"] }));
  users.fields.add(new NumberField({ name: "storage_used", onlyInt: true }));
  users.fields.add(new JSONField({   name: "settings", maxSize: 200000 }));
  users.fields.add(new FileField({
    name: "avatar", maxSelect: 1, maxSize: 1048576,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["100x100"],
  }));

  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  ["desired_retention", "fsrs_params", "timezone", "plan", "storage_used", "settings", "avatar"]
    .forEach((n) => users.fields.removeByName(n));
  app.save(users);
});
